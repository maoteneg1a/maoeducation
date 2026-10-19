import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'

/**
 * Cierre/apertura de año lectivo ("rollover"): crea el año siguiente a partir
 * del actual, copiando estructura (períodos, paralelos, tutores, asignaciones)
 * y matriculando a los estudiantes según la decisión de promoción:
 *  - promoted     → mismo nombre de paralelo en el nivel siguiente (por sortOrder)
 *  - not_promoted → mismo nivel y paralelo (repite)
 *  - pending / sin decisión → según `pendingPolicy`
 *  - promovido del último nivel → egresa (no se matricula)
 */

export type PendingPolicy = 'skip' | 'promote' | 'repeat'

export interface RolloverOptions {
  name: string
  startDate: string
  endDate: string
  copyAssignments: boolean
  copyTutors: boolean
  enrollStudents: boolean
  pendingPolicy: PendingPolicy
  activate: boolean
}

interface Plan {
  source: { id: string; name: string; startDate: Date }
  periods: Array<{ schemeId: string; periodNumber: number; name: string; startDate: Date; endDate: Date }>
  parallels: Array<{ key: string; levelId: string; levelName: string; name: string; tutorId: string | null; capacity: number | null; educationOffer: string | null }>
  assignments: Array<{ parallelKey: string; teacherId: string; subjectId: string; examWeight: number; projectWeight: number | null; weeklyPeriodsOverride: number | null }>
  enrollments: Array<{ studentId: string; parallelKey: string; outcome: 'promoted' | 'repeats' }>
  graduating: number
  skippedPending: number
  counts: { promoted: number; repeats: number; pending: number }
}

const DAY_MS = 86_400_000

function shift(date: Date, deltaDays: number): Date {
  return new Date(date.getTime() + deltaDays * DAY_MS)
}

async function buildPlan(institutionId: string, sourceYearId: string, opts: Pick<RolloverOptions, 'startDate' | 'pendingPolicy'>): Promise<Plan> {
  const source = await prisma.academicYear.findFirst({
    where: { id: sourceYearId, institutionId },
    include: { academicPeriods: { orderBy: { periodNumber: 'asc' } } },
  })
  if (!source) throw new NotFoundError('Año académico no encontrado')

  const newStart = new Date(opts.startDate)
  if (Number.isNaN(newStart.getTime())) throw new BadRequestError('Fecha de inicio inválida')
  const delta = Math.round((newStart.getTime() - source.startDate.getTime()) / DAY_MS)

  const [levels, parallels, assignments, enrollments, decisions] = await Promise.all([
    prisma.level.findMany({ where: { institutionId, isActive: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.parallel.findMany({
      where: { institutionId, academicYearId: sourceYearId, isActive: true },
      include: { level: { select: { name: true } } },
    }),
    prisma.courseAssignment.findMany({
      where: { institutionId, academicYearId: sourceYearId, isActive: true },
    }),
    prisma.studentEnrollment.findMany({
      where: { institutionId, academicYearId: sourceYearId, status: 'active' },
      select: { studentId: true, parallel: { select: { levelId: true, name: true } } },
    }),
    prisma.promotionDecision.findMany({
      where: { institutionId, academicYearId: sourceYearId },
      select: { studentId: true, status: true },
    }),
  ])

  const nextLevel = new Map<string, string | null>()
  levels.forEach((l, i) => nextLevel.set(l.id, levels[i + 1]?.id ?? null))
  const levelName = new Map(levels.map((l) => [l.id, l.name]))
  const keyOf = (levelId: string, name: string) => `${levelId}::${name}`

  const planParallels = new Map<string, Plan['parallels'][number]>()
  for (const p of parallels) {
    planParallels.set(keyOf(p.levelId, p.name), {
      key: keyOf(p.levelId, p.name),
      levelId: p.levelId,
      levelName: p.level.name,
      name: p.name,
      tutorId: p.tutorId,
      capacity: p.capacity,
      educationOffer: p.educationOffer,
    })
  }
  const parallelKeyById = new Map(parallels.map((p) => [p.id, keyOf(p.levelId, p.name)]))

  const decisionBy = new Map(decisions.map((d) => [d.studentId, d.status]))
  const planEnrollments: Plan['enrollments'] = []
  let graduating = 0
  let skippedPending = 0
  const counts = { promoted: 0, repeats: 0, pending: 0 }
  for (const e of enrollments) {
    const status = decisionBy.get(e.studentId) ?? 'pending'
    let outcome: 'promoted' | 'repeats' | null =
      status === 'promoted' ? 'promoted' : status === 'not_promoted' ? 'repeats' : null
    if (!outcome) {
      counts.pending++
      if (opts.pendingPolicy === 'skip') {
        skippedPending++
        continue
      }
      outcome = opts.pendingPolicy === 'promote' ? 'promoted' : 'repeats'
    }
    const targetLevel = outcome === 'promoted' ? nextLevel.get(e.parallel.levelId) : e.parallel.levelId
    if (outcome === 'promoted') counts.promoted++
    else counts.repeats++
    if (!targetLevel) {
      graduating++
      continue
    }
    const key = keyOf(targetLevel, e.parallel.name)
    // Si el nivel destino no tenía ese paralelo, se crea (sin tutor) para recibirlos.
    if (!planParallels.has(key)) {
      planParallels.set(key, {
        key,
        levelId: targetLevel,
        levelName: levelName.get(targetLevel) ?? '',
        name: e.parallel.name,
        tutorId: null,
        capacity: null,
        educationOffer: null,
      })
    }
    planEnrollments.push({ studentId: e.studentId, parallelKey: key, outcome })
  }

  return {
    source: { id: source.id, name: source.name, startDate: source.startDate },
    periods: source.academicPeriods.map((p) => ({
      schemeId: p.schemeId,
      periodNumber: p.periodNumber,
      name: p.name,
      startDate: shift(p.startDate, delta),
      endDate: shift(p.endDate, delta),
    })),
    parallels: [...planParallels.values()],
    assignments: assignments.map((a) => ({
      parallelKey: parallelKeyById.get(a.parallelId)!,
      teacherId: a.teacherId,
      subjectId: a.subjectId,
      examWeight: a.examWeight,
      projectWeight: a.projectWeight,
      weeklyPeriodsOverride: a.weeklyPeriodsOverride,
    })).filter((a) => !!a.parallelKey),
    enrollments: planEnrollments,
    graduating,
    skippedPending,
    counts,
  }
}

export async function previewRollover(institutionId: string, sourceYearId: string, opts: Pick<RolloverOptions, 'startDate' | 'pendingPolicy'>) {
  const plan = await buildPlan(institutionId, sourceYearId, opts)
  return {
    sourceYear: plan.source.name,
    periods: plan.periods.map((p) => ({ name: p.name, startDate: p.startDate.toISOString().slice(0, 10), endDate: p.endDate.toISOString().slice(0, 10) })),
    parallels: plan.parallels.length,
    assignments: plan.assignments.length,
    students: {
      toEnroll: plan.enrollments.length,
      promoted: plan.counts.promoted,
      repeats: plan.counts.repeats,
      pending: plan.counts.pending,
      skippedPending: plan.skippedPending,
      graduating: plan.graduating,
    },
    byParallel: plan.parallels
      .map((p) => ({
        label: `${p.levelName} ${p.name}`,
        students: plan.enrollments.filter((e) => e.parallelKey === p.key).length,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { numeric: true })),
  }
}

export async function executeRollover(institutionId: string, sourceYearId: string, opts: RolloverOptions) {
  const name = opts.name.trim()
  if (!name) throw new BadRequestError('El nombre del año es requerido')
  if (new Date(opts.endDate) <= new Date(opts.startDate)) throw new BadRequestError('La fecha de fin debe ser posterior a la de inicio')
  const exists = await prisma.academicYear.findFirst({ where: { institutionId, name } })
  if (exists) throw new ConflictError(`Ya existe un año académico con el nombre "${name}"`)

  const plan = await buildPlan(institutionId, sourceYearId, opts)

  return prisma.$transaction(
    async (tx) => {
      const year = await tx.academicYear.create({
        data: { institutionId, name, startDate: new Date(opts.startDate), endDate: new Date(opts.endDate), isActive: false },
      })
      if (plan.periods.length) {
        await tx.academicPeriod.createMany({
          data: plan.periods.map((p, i) => ({ ...p, academicYearId: year.id, isActive: i === 0 })),
        })
      }

      const parallelIdByKey = new Map<string, string>()
      for (const p of plan.parallels) {
        const created = await tx.parallel.create({
          data: {
            institutionId,
            levelId: p.levelId,
            academicYearId: year.id,
            name: p.name,
            capacity: p.capacity,
            educationOffer: p.educationOffer,
            tutorId: opts.copyTutors ? p.tutorId : null,
          },
          select: { id: true },
        })
        parallelIdByKey.set(p.key, created.id)
      }

      let assignmentsCreated = 0
      if (opts.copyAssignments && plan.assignments.length) {
        const res = await tx.courseAssignment.createMany({
          data: plan.assignments.map((a) => ({
            institutionId,
            academicYearId: year.id,
            parallelId: parallelIdByKey.get(a.parallelKey)!,
            teacherId: a.teacherId,
            subjectId: a.subjectId,
            examWeight: a.examWeight,
            projectWeight: a.projectWeight,
            weeklyPeriodsOverride: a.weeklyPeriodsOverride,
          })),
          skipDuplicates: true,
        })
        assignmentsCreated = res.count
      }

      let enrolled = 0
      if (opts.enrollStudents && plan.enrollments.length) {
        const res = await tx.studentEnrollment.createMany({
          data: plan.enrollments.map((e) => ({
            institutionId,
            studentId: e.studentId,
            parallelId: parallelIdByKey.get(e.parallelKey)!,
            academicYearId: year.id,
          })),
          skipDuplicates: true,
        })
        enrolled = res.count
      }

      if (opts.activate) {
        await tx.academicYear.updateMany({ where: { institutionId, isActive: true }, data: { isActive: false } })
        await tx.academicYear.update({ where: { id: year.id }, data: { isActive: true } })
      }

      return {
        yearId: year.id,
        name: year.name,
        periods: plan.periods.length,
        parallels: plan.parallels.length,
        assignments: assignmentsCreated,
        enrolled,
        graduating: plan.graduating,
        skippedPending: plan.skippedPending,
        activated: opts.activate,
      }
    },
    { timeout: 120_000 },
  )
}
