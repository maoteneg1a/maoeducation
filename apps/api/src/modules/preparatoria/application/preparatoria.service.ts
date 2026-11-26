import { Prisma } from '@prisma/client'
import type { AccessTokenPayload } from '../../../shared/infrastructure/services/token.service'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import { actorOf, hasPermission, isAuthority } from '../../../shared/infrastructure/services/actor'
import { STUDENT_ENROLLMENT_ORDER } from '../../../shared/infrastructure/services/enrollment-query'
import { AMBITS, CATALOG, type CatalogItem, configureSchema, historicalCompetencies, selectionSchema, valuesSchema, isPreparatoryLevel, scaleFor, uniqueKeys } from '../domain/preparatoria-policy'
import { preparatoryTeacherScope } from '../domain/preparatoria-scope'

export type PrepActor = AccessTokenPayload
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const canWrite = (actor: PrepActor) => hasPermission(actorOf(actor), 'grades', 'write', 'own')
const canRead = (actor: PrepActor) => canWrite(actor) || hasPermission(actorOf(actor), 'grades', 'read', 'own')
function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new BadRequestError('Datos de Preparatoria inválidos. Revisa la selección, valoraciones y versión antes de guardar.')
  return result.data
}
function unpack(program: { catalog: unknown; selections: unknown; ambitTeachers: unknown }) {
  const catalog = program.catalog as CatalogItem[]
  const storedSelections = program.selections as Record<string, string[]>
  const indicatorKeys = new Set(catalog.map(item => item.key))
  const indicatorsByCompetency = new Map<string, string[]>()
  for (const item of catalog) {
    const group = indicatorsByCompetency.get(item.competencyCode)
    if (group) group.push(item.key)
    else indicatorsByCompetency.set(item.competencyCode, [item.key])
  }
  // Recupera la selección de indicadores sin convertir las valoraciones anteriores.
  const selections = Object.fromEntries(Object.entries(storedSelections).map(([periodId, keys]) => [
    periodId, [...new Set(keys.flatMap(key => indicatorKeys.has(key) ? [key] : indicatorsByCompetency.get(key) ?? []))],
  ]))
  return { catalog, selections, storedSelections, ambitTeachers: program.ambitTeachers as Record<string, string> }
}

type GradeScope = { institutionId: string; academicYearId: string; levelId: string }
function gradePrograms({ institutionId, academicYearId, levelId }: GradeScope): Prisma.PreparatoryProgramWhereInput {
  return { institutionId, academicYearId, parallel: { institutionId, academicYearId, levelId } }
}

async function lockGrade(tx: Prisma.TransactionClient, grade: GradeScope) {
  // Una valoración nueva y un cambio de distribución del grado no pueden cruzarse.
  const key = `preparatoria:${grade.institutionId}:${grade.academicYearId}:${grade.levelId}`
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}

export async function preparatoryOptions(actor: PrepActor) {
  if (!canRead(actor) || (!isAuthority(actorOf(actor)) && !actor.roles.includes('teacher'))) return { parallels: [] }
  const parallels = await prisma.parallel.findMany({
    where: { institutionId: actor.institutionId, isActive: true,
      level: { code: '1B' },
      ...(!isAuthority(actorOf(actor)) && { OR: [{ tutorId: actor.sub }, preparatoryTeacherScope(actor.sub)] }),
    },
    include: { level: true, academicYear: true, preparatoryProgram: { select: { enabled: true } } },
    orderBy: [{ academicYear: { startDate: 'desc' } }, { name: 'asc' }],
  })
  return { parallels: parallels.map(p => ({ id: p.id, name: p.name, levelName: p.level.name, yearId: p.academicYearId, yearName: p.academicYear.name, isActiveYear: p.academicYear.isActive, enabled: p.preparatoryProgram?.enabled ?? false })) }
}

async function context(actor: PrepActor, parallelId: string, periodId?: string) {
  if (!canRead(actor)) throw new ForbiddenError()
  const parallel = await prisma.parallel.findFirst({ where: { id: parallelId, institutionId: actor.institutionId },
    include: { level: true, academicYear: { include: { academicPeriods: { orderBy: { periodNumber: 'asc' } } } },
      tutor: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  })
  if (!parallel || !isPreparatoryLevel(parallel.level)) throw new NotFoundError('Paralelo de Preparatoria no encontrado')
  const authority = isAuthority(actorOf(actor))
  const program = await prisma.preparatoryProgram.findFirst({ where: { institutionId: actor.institutionId, parallelId: parallel.id, academicYearId: parallel.academicYearId } })
  const directlyAssigned = !!program?.enabled && Object.values(program.ambitTeachers as Record<string, string>).includes(actor.sub)
  if (!authority && (!actor.roles.includes('teacher') || (!directlyAssigned && parallel.tutorId !== actor.sub))) throw new ForbiddenError()
  const canConfigure = canWrite(actor) && authority
  // Las asignaciones de materias y los horarios no determinan quién puede valorar ámbitos.
  const teachers = canConfigure ? await prisma.user.findMany({
    where: { institutionId: actor.institutionId, isActive: true, userRoles: { some: { role: { institutionId: actor.institutionId, name: 'teacher' } } } },
    select: { id: true, profile: { select: { firstName: true, lastName: true } } },
    orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
  }) : []
  const coordinator = parallel.tutorId
  if (periodId && !parallel.academicYear.academicPeriods.some(p => p.id === periodId)) throw new BadRequestError('El período no pertenece al año lectivo de este paralelo')
  return { parallel, program, authority, teachers: teachers.map(t => ({ id: t.id, name: `${t.profile?.lastName ?? ''} ${t.profile?.firstName ?? ''}`.trim() })), coordinator, canConfigure }
}

export async function preparatoryContext(actor: PrepActor, parallelId: string) {
  const ctx = await context(actor, parallelId)
  const data = ctx.program ? unpack(ctx.program) : null
  const viewAll = ctx.authority || ctx.coordinator === actor.sub
  const visibleAmbits = AMBITS.filter(a => viewAll || data?.ambitTeachers[a.id] === actor.sub)
  const curriculumLocked = ctx.canConfigure && !!await prisma.preparatoryProgram.findFirst({
    where: { ...gradePrograms(ctx.parallel), values: { some: {} } }, select: { id: true },
  })
  return {
    parallel: { id: ctx.parallel.id, name: ctx.parallel.name, levelName: ctx.parallel.level.name, yearId: ctx.parallel.academicYearId, yearName: ctx.parallel.academicYear.name, tutorName: ctx.parallel.tutor ? `${ctx.parallel.tutor.profile?.lastName ?? ''} ${ctx.parallel.tutor.profile?.firstName ?? ''}`.trim() : null },
    periods: ctx.parallel.academicYear.academicPeriods.map(p => ({ id: p.id, name: p.name, isActive: p.isActive, isClosed: p.isClosed })),
    program: ctx.program && data ? { ...ctx.program, catalog: data.catalog.filter(item => visibleAmbits.some(a => a.id === item.ambit)), selections: data.selections } : null, ambits: visibleAmbits, catalogSource: CATALOG.source,
    teachers: ctx.teachers, canConfigure: ctx.canConfigure, curriculumLocked,
    editableAmbits: canWrite(actor) && ctx.program?.enabled ? AMBITS.filter(a => ctx.authority || data?.ambitTeachers[a.id] === actor.sub).map(a => a.id) : [],
    canComment: canWrite(actor) && (ctx.authority || ctx.coordinator === actor.sub),
    scale: scaleFor(ctx.program?.scaleVersion ?? '2026-00082A'),
  }
}

export async function prepareProgram(actor: PrepActor, parallelId: string) {
  const ctx = await context(actor, parallelId)
  if (!ctx.canConfigure) throw new ForbiddenError('Solo la autoridad puede activar la modalidad de Primero de Básica')
  if (ctx.program) return preparatoryContext(actor, parallelId)
  await prisma.$transaction(async tx => {
    await lockGrade(tx, ctx.parallel)
    // Preferir un catálogo con valoraciones, seguido de uno revisado.
    const source = await tx.preparatoryProgram.findFirst({
      where: gradePrograms(ctx.parallel),
      orderBy: [{ values: { _count: 'desc' } }, { reviewedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      select: { catalogVersion: true, catalog: true },
    })
    await tx.preparatoryProgram.upsert({ where: { parallelId }, update: {}, create: {
      institutionId: actor.institutionId, parallelId, academicYearId: ctx.parallel.academicYearId,
      enabled: false, catalogVersion: source?.catalogVersion ?? CATALOG.version, catalog: json(source?.catalog ?? CATALOG.items),
      ambitTeachers: json(Object.fromEntries(AMBITS.map(a => [a.id, ctx.coordinator ?? '']))),
    } })
  }, { timeout: 30000 })
  return preparatoryContext(actor, parallelId)
}

async function mutate<T>(actor: PrepActor, ctx: Awaited<ReturnType<typeof context>>, expectedRevision: number, action: string,
  operation: (tx: Prisma.TransactionClient, program: NonNullable<typeof ctx.program>) => Promise<{ oldValue: unknown; newValue: unknown; result: T }>) {
  const program = ctx.program
  if (!program) throw new BadRequestError('Prepara primero el catálogo de Preparatoria')
  if (program.revision !== expectedRevision) throw new ConflictError('La información cambió en otra sesión. Recarga antes de guardar; tus cambios no se han aplicado.')
  return prisma.$transaction(async tx => {
    await lockGrade(tx, ctx.parallel)
    const locked = await tx.preparatoryProgram.updateMany({ where: { id: program.id, institutionId: actor.institutionId, revision: expectedRevision }, data: { revision: { increment: 1 } } })
    if (locked.count !== 1) throw new ConflictError('La información cambió en otra sesión. Recarga antes de guardar.')
    const output = await operation(tx, program)
    await tx.auditLog.create({ data: { institutionId: actor.institutionId, userId: actor.sub, impersonatorId: actor.impersonatedBy,
      action, resourceType: 'preparatoria', resourceId: program.id, oldValue: json(output.oldValue), newValue: json(output.newValue) } })
    return output.result
  }, { timeout: 30000 })
}

export async function configureProgram(actor: PrepActor, parallelId: string, body: unknown) {
  const ctx = await context(actor, parallelId)
  if (!ctx.canConfigure) throw new ForbiddenError('Solo la autoridad puede configurar la modalidad de Primero de Básica')
  const input = parse(configureSchema, body)
  const existing = ctx.program ? unpack(ctx.program) : null
  if (!existing) throw new BadRequestError('Prepara primero el catálogo')
  const distribution = new Map(input.distribution.map(row => [row.key, row.ambit]))
  if (distribution.size !== existing.catalog.length || input.distribution.length !== existing.catalog.length || existing.catalog.some(item => !distribution.has(item.key))) throw new BadRequestError('La distribución debe incluir el catálogo completo, sin duplicados')
  for (const a of AMBITS) {
    const teacherId = input.ambitTeachers[a.id]
    if (input.enabled && !ctx.teachers.some(t => t.id === teacherId)) throw new BadRequestError(`Asigna un docente activo de la institución a ${a.name}`)
    if (teacherId && !ctx.teachers.some(t => t.id === teacherId)) throw new BadRequestError('El responsable debe ser un docente activo de esta institución')
  }
  const catalog = existing.catalog.map(item => ({ ...item, ambit: distribution.get(item.key)! }))
  const distributionChanged = existing.catalog.some(item => item.ambit !== distribution.get(item.key))
  await mutate(actor, ctx, input.expectedRevision, 'preparatoria.configure', async (tx, program) => {
    if (input.scaleVersion !== program.scaleVersion && await tx.preparatoryValue.count({ where: { programId: program.id } })) {
      throw new ConflictError('La escala de este paralelo tiene valoraciones históricas.')
    }
    if (distributionChanged) {
      const scope = gradePrograms(ctx.parallel)
      const graded = await tx.preparatoryProgram.findFirst({ where: { ...scope, values: { some: {} } }, select: { id: true } })
      if (graded) throw new ConflictError('La distribución del grado está protegida porque ya existen valoraciones históricas.')
      const siblings = await tx.preparatoryProgram.findMany({
        where: { ...scope, id: { not: program.id } },
        select: { id: true, catalog: true, catalogVersion: true },
      })
      for (const sibling of siblings) {
        const oldCatalog = sibling.catalog as unknown as CatalogItem[]
        if (sibling.catalogVersion !== program.catalogVersion || oldCatalog.length !== catalog.length || oldCatalog.some(item => !distribution.has(item.key))) {
          throw new ConflictError('Hay versiones de catálogo incompatibles entre los paralelos de este grado.')
        }
        if (oldCatalog.every(item => item.ambit === distribution.get(item.key))) continue
        const newCatalog = oldCatalog.map(item => ({ ...item, ambit: distribution.get(item.key)! }))
        await tx.preparatoryProgram.update({
          where: { id: sibling.id }, data: { catalog: json(newCatalog), revision: { increment: 1 } },
        })
        await tx.auditLog.create({
          data: { institutionId: actor.institutionId, userId: actor.sub, impersonatorId: actor.impersonatedBy,
            action: 'preparatoria.distribution', resourceType: 'preparatoria', resourceId: sibling.id,
            oldValue: json({ catalog: oldCatalog }), newValue: json({ catalog: newCatalog, sourceParallelId: parallelId }) },
        })
      }
    }
    const update = { enabled: input.enabled, catalog: json(catalog), scaleVersion: input.scaleVersion, ambitTeachers: json(input.ambitTeachers), reviewedAt: new Date(), reviewedBy: actor.sub }
    await tx.preparatoryProgram.update({ where: { id: program.id }, data: update })
    return { oldValue: { enabled: program.enabled, catalog: existing.catalog, scaleVersion: program.scaleVersion, ambitTeachers: existing.ambitTeachers }, newValue: update, result: null }
  })
  return preparatoryContext(actor, parallelId)
}

export async function selectPeriodLearning(actor: PrepActor, parallelId: string, periodId: string, body: unknown) {
  const ctx = await context(actor, parallelId, periodId)
  if (ctx.parallel.academicYear.academicPeriods.find(p => p.id === periodId)?.isClosed) throw new ConflictError('El período está cerrado; no se pueden modificar sus aprendizajes ni valoraciones')
  const input = parse(selectionSchema, body)
  if (!ctx.program?.enabled) throw new BadRequestError('El programa no está activado')
  const data = unpack(ctx.program)
  const editable = new Set(AMBITS.filter(a => canWrite(actor) && (ctx.authority || data.ambitTeachers[a.id] === actor.sub)).map(a => a.id))
  const existing = data.selections[periodId] ?? []
  if (!uniqueKeys(input.itemKeys) || input.itemKeys.some(key => !data.catalog.some(item => item.key === key))) throw new BadRequestError('La selección contiene indicadores desconocidos o repetidos')
  const changed = new Set([...existing, ...input.itemKeys].filter(key => existing.includes(key) !== input.itemKeys.includes(key)))
  if ([...changed].some(key => !editable.has(data.catalog.find(item => item.key === key)!.ambit))) throw new ForbiddenError('Solo puedes seleccionar aprendizajes de tus ámbitos asignados')
  if (!canWrite(actor)) throw new ForbiddenError()
  await mutate(actor, ctx, input.expectedRevision, 'preparatoria.selection', async (tx, program) => {
    const selections = { ...data.storedSelections, [periodId]: input.itemKeys }
    await tx.preparatoryProgram.update({ where: { id: program.id }, data: { selections: json(selections) } })
    return { oldValue: { periodId, itemKeys: data.storedSelections[periodId] ?? [] }, newValue: { periodId, itemKeys: input.itemKeys }, result: null }
  })
  return preparatorySheet(actor, parallelId, periodId)
}

export async function preparatorySheet(actor: PrepActor, parallelId: string, periodId: string) {
  const ctx = await context(actor, parallelId, periodId)
  if (!ctx.program?.enabled) throw new BadRequestError('El programa de este paralelo no está activado')
  const [enrollments, values, comments] = await Promise.all([
    prisma.studentEnrollment.findMany({ where: { institutionId: actor.institutionId, academicYearId: ctx.parallel.academicYearId, parallelId, status: 'active' }, orderBy: STUDENT_ENROLLMENT_ORDER,
      select: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true, dni: true } } } } } }),
    prisma.preparatoryValue.findMany({ where: { institutionId: actor.institutionId, programId: ctx.program.id, periodId } }),
    prisma.preparatoryComment.findMany({ where: { institutionId: actor.institutionId, programId: ctx.program.id, periodId } }),
  ])
  const studentIds = new Set(enrollments.map(e => e.student.id))
  const data = unpack(ctx.program), viewAll = ctx.authority || ctx.coordinator === actor.sub
  const visibleKeys = new Set(data.catalog.filter(item => viewAll || data.ambitTeachers[item.ambit] === actor.sub).map(item => item.key))
  return { revision: ctx.program.revision, selectedKeys: (data.selections[periodId] ?? []).filter(key => visibleKeys.has(key)),
    students: enrollments.map(e => ({ id: e.student.id, name: `${e.student.profile?.lastName ?? ''} ${e.student.profile?.firstName ?? ''}`.trim(), document: e.student.profile?.dni ?? '' })),
    values: values.filter(v => studentIds.has(v.studentId) && visibleKeys.has(v.itemKey)), comments: viewAll ? comments.filter(c => studentIds.has(c.studentId)) : [],
  }
}

export async function savePreparatoryValues(actor: PrepActor, parallelId: string, periodId: string, body: unknown) {
  const ctx = await context(actor, parallelId, periodId)
  if (ctx.parallel.academicYear.academicPeriods.find(p => p.id === periodId)?.isClosed) throw new ConflictError('El período está cerrado; no se pueden modificar sus aprendizajes ni valoraciones')
  if (!canWrite(actor) || !ctx.program?.enabled) throw new ForbiddenError()
  const input = parse(valuesSchema, body), data = unpack(ctx.program)
  if (!uniqueKeys(input.values.map(v => `${v.studentId}:${v.itemKey}`)) || !uniqueKeys(input.comments.map(c => c.studentId))) throw new BadRequestError('Hay estudiantes o celdas duplicadas')
  for (const value of input.values) {
    const item = data.catalog.find(i => i.key === value.itemKey)
    if (!item || !data.selections[periodId]?.includes(value.itemKey)) throw new BadRequestError('El aprendizaje no está seleccionado para este período')
    if (!ctx.authority && data.ambitTeachers[item.ambit] !== actor.sub) throw new ForbiddenError('Este ámbito está asignado a otro docente')
  }
  if (input.comments.length && !ctx.authority && ctx.coordinator !== actor.sub) throw new ForbiddenError('Las recomendaciones generales las registra el docente coordinador')
  await mutate(actor, ctx, input.expectedRevision, 'preparatoria.values', async (tx, program) => {
    const ids = [...new Set([...input.values.map(v => v.studentId), ...input.comments.map(c => c.studentId)])]
    const enrolled = await tx.studentEnrollment.count({ where: { institutionId: actor.institutionId, academicYearId: ctx.parallel.academicYearId, parallelId, status: 'active', studentId: { in: ids } } })
    if (enrolled !== ids.length) throw new BadRequestError('Hay estudiantes fuera de la matrícula activa de este paralelo')
    const oldValues = await tx.preparatoryValue.findMany({ where: { programId: program.id, periodId, studentId: { in: ids } } })
    const oldComments = await tx.preparatoryComment.findMany({ where: { programId: program.id, periodId, studentId: { in: ids } } })
    for (const value of input.values) await tx.preparatoryValue.upsert({
      where: { programId_studentId_periodId_itemKey: { programId: program.id, studentId: value.studentId, periodId, itemKey: value.itemKey } },
      create: { institutionId: actor.institutionId, programId: program.id, periodId, ...value, notes: value.notes.trim(), recordedBy: actor.sub },
      update: { code: value.code, notes: value.notes.trim(), recordedBy: actor.sub },
    })
    for (const comment of input.comments) await tx.preparatoryComment.upsert({
      where: { programId_studentId_periodId: { programId: program.id, studentId: comment.studentId, periodId } },
      create: { institutionId: actor.institutionId, programId: program.id, periodId, ...comment, text: comment.text.trim(), recordedBy: actor.sub }, update: { text: comment.text.trim(), recordedBy: actor.sub },
    })
    return { oldValue: { periodId, values: oldValues, comments: oldComments }, newValue: { periodId, values: input.values, comments: input.comments }, result: null }
  })
  return preparatorySheet(actor, parallelId, periodId)
}

/** Usado solo después de que el informe habitual verifica la autorización sobre el estudiante. */
export async function preparatoryReport(institutionId: string, parallelId: string, yearId: string, studentId: string, viewer?: Pick<PrepActor, 'sub' | 'roles'>) {
  const parallel = await prisma.parallel.findFirst({ where: { id: parallelId, institutionId, academicYearId: yearId }, select: { tutorId: true, level: { select: { code: true, subnivel: true } } } })
  if (!parallel || !isPreparatoryLevel(parallel.level)) return null
  const program = await prisma.preparatoryProgram.findFirst({ where: { institutionId, parallelId, academicYearId: yearId, enabled: true } })
  if (!program) return null
  const [values, comments] = await Promise.all([
    prisma.preparatoryValue.findMany({ where: { institutionId, programId: program.id, studentId } }),
    prisma.preparatoryComment.findMany({ where: { institutionId, programId: program.id, studentId } }),
  ])
  const data = unpack(program)
  const restricted = !!viewer && viewer.roles.includes('teacher') && !viewer.roles.some(role => ['admin','rector'].includes(role)) && parallel.tutorId !== viewer.sub
  const evaluated = new Set(values.map(value => value.itemKey))
  const keys = new Set([...Object.values(data.selections).flat(), ...evaluated])
  const periods = [...new Set([...Object.keys(data.selections), ...values.map(value => value.periodId)])]
  const rows = [
    ...data.catalog.filter(item => keys.has(item.key)).map(item => ({ ...item, historicalCompetency: false })),
    ...historicalCompetencies(data.catalog).filter(item => evaluated.has(item.key)).map(item => ({ ...item, historicalCompetency: true })),
  ]
  return { catalogVersion: program.catalogVersion, scaleVersion: program.scaleVersion, scale: scaleFor(program.scaleVersion), ambits: AMBITS,
    rows: rows.filter(item => !restricted || data.ambitTeachers[item.ambit] === viewer!.sub).map(item => ({ ...item, periods: Object.fromEntries(periods.map(periodId => {
      const value = values.find(v => v.itemKey === item.key && v.periodId === periodId)
      const selected = item.historicalCompetency
        ? !!value && (data.storedSelections[periodId]?.includes(item.key) ?? false)
        : data.selections[periodId]?.includes(item.key) ?? false
      return [periodId, { selected, code: value?.code ?? null, notes: value?.notes ?? '' }]
    })) })),
    comments: restricted ? [] : comments.map(c => ({ periodId: c.periodId, text: c.text })),
  }
}
export type PreparatoryReport = NonNullable<Awaited<ReturnType<typeof preparatoryReport>>>
