import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import { findGradeByCode } from '../../../../shared/domain/grade-catalog'
import { MultigradeDomainError, resolveMultigradeSelections } from '../../../../shared/domain/multigrade'

/**
 * Resolución de materia/nivel compartida entre el wizard de setup
 * (/personal/setup) y la edición posterior (/personal/classes) — ambos
 * necesitan exactamente la misma lógica de find-or-create para no duplicar
 * Subjects/Levels/Parallels cuando el docente vuelve a tocar su estructura.
 */

export type PlanningModel = 'destrezas' | 'competencias'

/**
 * El docente nunca escribe el nombre de una materia a mano: elige de un
 * catálogo oficial (banco de destrezas o de competencias, según el
 * planningModel de la institución) y aquí resolvemos el/los área(s)
 * seleccionadas contra ese catálogo real — sin heurística de texto de ningún
 * tipo. El código MINEDUC (M, LL, CN, CS, ECA, EF, EFL, EG...) es compartido
 * entre ambos bancos, así que además de vincular el área del modelo elegido,
 * intentamos enlazar también la equivalente del otro banco por code exacto —
 * no por keywords — para que si el profesor cambia de planningModel más
 * adelante la materia ya quede enlazada en ambos.
 */
export async function resolveSubjectAreaLinks(
  planningModel: PlanningModel,
  areaId: string,
): Promise<{ name: string; curriculumAreaId?: string; competencyAreaId?: string }> {
  if (planningModel === 'competencias') {
    const competencyArea = await prisma.competencyArea.findFirst({ where: { id: areaId } })
    if (!competencyArea) throw new NotFoundError('Área de competencias no encontrada en el catálogo')
    const curriculumArea = await prisma.curriculumArea.findFirst({
      where: { code: competencyArea.code },
      select: { id: true },
    })
    return {
      name: competencyArea.name,
      competencyAreaId: competencyArea.id,
      ...(curriculumArea ? { curriculumAreaId: curriculumArea.id } : {}),
    }
  }

  const curriculumArea = await prisma.curriculumArea.findFirst({ where: { id: areaId } })
  if (!curriculumArea) throw new NotFoundError('Área curricular no encontrada en el catálogo')
  const competencyArea = await prisma.competencyArea.findFirst({
    where: { code: curriculumArea.code },
    select: { id: true },
  })
  return {
    name: curriculumArea.name,
    curriculumAreaId: curriculumArea.id,
    ...(competencyArea ? { competencyAreaId: competencyArea.id } : {}),
  }
}

/**
 * Reusa una materia existente con la misma área en vez de duplicarla si el
 * profesor ya la había creado antes — el catálogo de áreas es fijo por
 * institución, así que dos Subjects con la misma área serían redundantes.
 */
export async function getOrCreateSubjectForArea(
  institutionId: string,
  planningModel: PlanningModel,
  areaId: string,
) {
  const { name, curriculumAreaId, competencyAreaId } = await resolveSubjectAreaLinks(planningModel, areaId)
  const existing = await prisma.subject.findFirst({
    where: {
      institutionId,
      ...(curriculumAreaId ? { curriculumAreaId } : {}),
      ...(competencyAreaId ? { competencyAreaId } : {}),
    },
  })
  if (existing) return existing
  return prisma.subject.create({
    data: { institutionId, name, curriculumAreaId, competencyAreaId },
  })
}

/**
 * Encuentra o crea el `Level` real (ej. "6B") para un código del catálogo
 * general (GRADE_CATALOG, incluye INICIAL/EGB/BGU) — NUNCA un código
 * sintético como "PERSONAL": el filtro de CompetencySaber.gradeCodes depende
 * de que Level.code sea un grado real (bug real ya corregido, ver PR #57).
 */
export async function ensureLevelForGrade(institutionId: string, rawGradeCode: string) {
  const grade = findGradeByCode(rawGradeCode)
  if (!grade) throw new BadRequestError(`Grado "${rawGradeCode}" no reconocido en el catálogo`)

  let level = await prisma.level.findFirst({ where: { institutionId, code: grade.code } })
  if (!level) {
    level = await prisma.level.create({
      data: { institutionId, code: grade.code, name: grade.name, sortOrder: grade.sortOrder, subnivel: grade.subnivel },
    })
  } else if (level.subnivel !== grade.subnivel) {
    level = await prisma.level.update({ where: { id: level.id }, data: { subnivel: grade.subnivel } })
  }
  return level
}

/**
 * Un solo paralelo por grado (uno por Level+año) — el nombre real del grado
 * ya vive en Level.name, así que el paralelo de una cuenta personal no
 * necesita distinguirse por nombre (a diferencia de una institución grande
 * con varios paralelos por grado). Reusa CUALQUIER paralelo existente para
 * ese Level+año sin importar su nombre — el wizard de setup (subject-first/
 * classroom-first) puede haber creado uno con el nombre que el docente
 * escribió a mano (ej. "5to A"); solo se crea uno nuevo llamado "A" si no
 * hay ninguno todavía, para no duplicar paralelos del mismo grado.
 */
export async function ensureParallelA(institutionId: string, levelId: string, academicYearId: string) {
  const existing = await prisma.parallel.findFirst({ where: { levelId, academicYearId } })
  if (existing) return existing
  return prisma.parallel.create({ data: { institutionId, name: 'A', levelId, academicYearId } })
}

// ────────────────────────────────────────────────────────────────────────────
// Edición post-onboarding: GET/PUT /personal/classes
// ────────────────────────────────────────────────────────────────────────────

export interface PersonalClassSelection {
  gradeCode: string
  subjectAreaId: string
}

export interface PersonalClassRow {
  gradeCode: string
  gradeName: string
  subnivel: string | null
  courseAssignmentId: string
  subjectId: string
  subjectName: string
  /** id del área (competencia o curricular, según el planningModel activo) para preseleccionar en el selector. */
  subjectAreaId: string | null
  isMultigradeMember: boolean
  hasDependentData: boolean
}

export interface PersonalClassesState {
  yearId: string
  planningModel: PlanningModel
  multigradeEnabled: boolean
  allowSuperiorExtension: boolean
  multigradeGroupId: string | null
  rows: PersonalClassRow[]
}

async function getActiveYear(institutionId: string) {
  const year =
    (await prisma.academicYear.findFirst({ where: { institutionId, isActive: true } })) ??
    (await prisma.academicYear.findFirst({ where: { institutionId }, orderBy: { createdAt: 'desc' } }))
  if (!year) throw new NotFoundError('No hay ningún año lectivo creado todavía')
  return year
}

/**
 * Una asignación tiene "datos dependientes" si el docente ya trabajó sobre
 * ella (insumos/actividades/notas/planificación/asistencia/tareas) — en ese
 * caso NO se borra automáticamente al reconciliar, para no perder trabajo
 * real (misma cautela que costó el incidente de TRUNCATE CASCADE de un hilo
 * anterior: nunca borrar en cascada sin verificar qué cuelga de la fila).
 */
async function hasDependentData(courseAssignmentId: string): Promise<boolean> {
  const [insumos, activities, plans, attendance, tasks, schedule] = await Promise.all([
    prisma.insumo.count({ where: { courseAssignmentId } }),
    prisma.activity.count({ where: { courseAssignmentId } }),
    prisma.curriculumPlan.count({ where: { courseAssignmentId } }),
    prisma.attendanceRecord.count({ where: { courseAssignmentId } }),
    prisma.task.count({ where: { courseAssignmentId } }),
    prisma.scheduleEntry.count({ where: { courseAssignmentId } }),
  ])
  return insumos + activities + plans + attendance + tasks + schedule > 0
}

export async function listPersonalClasses(institutionId: string): Promise<PersonalClassesState> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  const settings = (institution?.settings ?? {}) as Record<string, unknown>
  const planningModel = (settings.planningModel as PlanningModel | undefined) ?? 'destrezas'
  const multigradeEnabled = settings.multigradeEnabled === true
  const allowSuperiorExtension = settings.multigradeAllowSuperiorExtension === true

  const year = await getActiveYear(institutionId)

  const assignments = await prisma.courseAssignment.findMany({
    where: { institutionId, academicYearId: year.id },
    include: {
      subject: true,
      parallel: { include: { level: true } },
      multigradeGroupMember: true,
    },
    orderBy: [{ parallel: { level: { sortOrder: 'asc' } } }, { subject: { name: 'asc' } }],
  })

  const group = await prisma.multigradeGroup.findFirst({ where: { institutionId, academicYearId: year.id } })

  const rows: PersonalClassRow[] = []
  for (const a of assignments) {
    const areaId =
      planningModel === 'competencias' ? a.subject.competencyAreaId : a.subject.curriculumAreaId
    rows.push({
      gradeCode: a.parallel.level.code,
      gradeName: a.parallel.level.name,
      subnivel: a.parallel.level.subnivel,
      courseAssignmentId: a.id,
      subjectId: a.subjectId,
      subjectName: a.subject.name,
      subjectAreaId: areaId ?? null,
      isMultigradeMember: a.multigradeGroupMember !== null,
      hasDependentData: await hasDependentData(a.id),
    })
  }

  return {
    yearId: year.id,
    planningModel,
    multigradeEnabled,
    allowSuperiorExtension,
    multigradeGroupId: group?.id ?? null,
    rows,
  }
}

export interface ReconcilePersonalClassesResult {
  rows: PersonalClassRow[]
  multigradeGroupId: string | null
  blocked: Array<{ gradeCode: string; subjectName: string; reason: string }>
}

/**
 * Reconcilia la estructura académica de una cuenta personal contra la lista
 * completa de selecciones deseada — mismo patrón idempotente de find-or-create
 * que /personal/setup, más la parte que el wizard nunca necesitó: quitar lo
 * que ya no está en la lista. BGU nunca entra al MultigradeGroup (regla de
 * negocio de shared/domain/multigrade.ts) aunque multigradeEnabled esté on;
 * conviven como asignaciones normales.
 */
export async function reconcilePersonalClasses(
  institutionId: string,
  teacherId: string,
  selections: PersonalClassSelection[],
  multigradeEnabled: boolean,
  allowSuperiorExtension: boolean,
): Promise<ReconcilePersonalClassesResult> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  const settings = (institution?.settings ?? {}) as Record<string, unknown>
  const planningModel = (settings.planningModel as PlanningModel | undefined) ?? 'destrezas'
  const year = await getActiveYear(institutionId)

  const seen = new Set<string>()
  for (const s of selections) {
    const key = `${s.gradeCode.trim().toUpperCase()}::${s.subjectAreaId}`
    if (seen.has(key)) throw new BadRequestError(`La combinación grado "${s.gradeCode}" + materia está repetida`)
    seen.add(key)
  }

  const egbSelections = selections.filter((s) => findGradeByCode(s.gradeCode.trim().toUpperCase())?.subnivel !== 'bgu')
  if (multigradeEnabled) {
    try {
      resolveMultigradeSelections(egbSelections, allowSuperiorExtension)
    } catch (error) {
      if (error instanceof MultigradeDomainError) throw new BadRequestError(error.message)
      throw error
    }
  }

  // 1. Crear/mantener cada selección deseada.
  const keepAssignmentIds = new Set<string>()
  const parallelIdByGrade = new Map<string, string>()
  const blocked: ReconcilePersonalClassesResult['blocked'] = []

  for (const selection of selections) {
    const gradeCode = selection.gradeCode.trim().toUpperCase()
    const level = await ensureLevelForGrade(institutionId, gradeCode)

    let parallelId = parallelIdByGrade.get(gradeCode)
    if (!parallelId) {
      const parallel = await ensureParallelA(institutionId, level.id, year.id)
      parallelId = parallel.id
      parallelIdByGrade.set(gradeCode, parallelId)
    }

    const subject = await getOrCreateSubjectForArea(institutionId, planningModel, selection.subjectAreaId)

    const existing = await prisma.courseAssignment.findFirst({
      where: { subjectId: subject.id, parallelId, academicYearId: year.id },
    })
    const assignment =
      existing ??
      (await prisma.courseAssignment.create({
        data: { institutionId, subjectId: subject.id, parallelId, teacherId, academicYearId: year.id },
      }))
    keepAssignmentIds.add(assignment.id)
  }

  // 2. Quitar lo que ya no está en la lista deseada — solo si no tiene datos dependientes.
  const existingAssignments = await prisma.courseAssignment.findMany({
    where: { institutionId, academicYearId: year.id },
    include: { subject: true, parallel: { include: { level: true } } },
  })
  for (const a of existingAssignments) {
    if (keepAssignmentIds.has(a.id)) continue
    if (await hasDependentData(a.id)) {
      blocked.push({
        gradeCode: a.parallel.level.code,
        subjectName: a.subject.name,
        reason: 'Tiene actividades, notas, insumos o planificación ya registrados — no se puede quitar automáticamente.',
      })
      keepAssignmentIds.add(a.id) // se conserva
      continue
    }
    await prisma.multigradeGroupMember.deleteMany({ where: { courseAssignmentId: a.id } })
    await prisma.courseAssignment.delete({ where: { id: a.id } })
  }

  // 2b. Limpiar Paralelos (y su Level, si quedó sin ningún paralelo) que se
  // quedaron sin ninguna asignación tras el paso anterior — evita acumular
  // aulas fantasma como los "noveno A"/"NOVENO A" duplicados que motivaron
  // esta reconciliación en primer lugar.
  const orphanParallels = await prisma.parallel.findMany({
    where: { institutionId, academicYearId: year.id, courseAssignments: { none: {} } },
    select: { id: true, levelId: true },
  })
  for (const p of orphanParallels) {
    await prisma.parallel.delete({ where: { id: p.id } })
    const remaining = await prisma.parallel.count({ where: { levelId: p.levelId } })
    if (remaining === 0) {
      await prisma.level.delete({ where: { id: p.levelId } }).catch(() => {
        // Otro año lectivo puede seguir apuntando a este Level indirectamente
        // por historial — no forzar el borrado si Prisma reporta una FK viva.
      })
    }
  }

  // 3. Multigrado: sincronizar el grupo con las asignaciones EGB que queden.
  let group = await prisma.multigradeGroup.findFirst({ where: { institutionId, academicYearId: year.id } })
  const keptAssignments = await prisma.courseAssignment.findMany({
    where: { institutionId, academicYearId: year.id, id: { in: [...keepAssignmentIds] } },
    include: { parallel: { include: { level: true } } },
  })
  const egbKept = keptAssignments.filter((a) => a.parallel.level.subnivel !== 'bgu')

  if (multigradeEnabled && egbKept.length >= 2) {
    if (!group) {
      group = await prisma.multigradeGroup.create({
        data: {
          institutionId,
          teacherId,
          academicYearId: year.id,
          name: 'Aula multigrado',
          allowSuperiorExtension,
          createdBy: teacherId,
        },
      })
    } else if (group.allowSuperiorExtension !== allowSuperiorExtension) {
      group = await prisma.multigradeGroup.update({ where: { id: group.id }, data: { allowSuperiorExtension } })
    }
    const keepMemberIds = new Set(egbKept.map((a) => a.id))
    for (const a of egbKept) {
      await prisma.multigradeGroupMember.upsert({
        where: { courseAssignmentId: a.id },
        create: {
          groupId: group.id,
          gradeCode: a.parallel.level.code,
          courseAssignmentId: a.id,
          parallelId: a.parallelId,
          subjectId: a.subjectId,
        },
        update: { groupId: group.id, gradeCode: a.parallel.level.code },
      })
    }
    await prisma.multigradeGroupMember.deleteMany({
      where: { groupId: group.id, courseAssignmentId: { notIn: [...keepMemberIds] } },
    })
  } else if (group) {
    // Modo apagado (o ya no hay suficientes grados EGB): desarmar el grupo — los
    // miembros se borran en cascada (schema.prisma: onDelete: Cascade), las
    // asignaciones/Level/Parallel quedan intactos como clases normales.
    await prisma.multigradeGroup.delete({ where: { id: group.id } })
    group = null
  }

  await prisma.institution.update({
    where: { id: institutionId },
    data: {
      settings: {
        ...settings,
        multigradeEnabled,
        multigradeAllowSuperiorExtension: allowSuperiorExtension,
      } as unknown as Parameters<typeof prisma.institution.update>[0]['data']['settings'],
    },
  })

  const state = await listPersonalClasses(institutionId)
  return { rows: state.rows, multigradeGroupId: state.multigradeGroupId, blocked }
}
