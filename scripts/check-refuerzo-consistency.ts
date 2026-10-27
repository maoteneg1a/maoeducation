import assert from 'node:assert/strict'
import { prisma } from '../apps/api/src/shared/infrastructure/database/prisma'
import { computePeriodGrades } from '../apps/api/src/shared/infrastructure/services/period-grades.service'
import { saveReinforcementRegister } from '../apps/api/src/modules/pedagogic-recovery/infrastructure/services/reinforcement-grade-register.service'
import { saveReinforcementPlan, reopenReinforcementForCorrection } from '../apps/api/src/modules/pedagogic-recovery/application/services/reinforcement-workflow.service'
import { PrismaActivityRepository } from '../apps/api/src/modules/activities/infrastructure/repositories/prisma-activity.repository'
import { PrismaReinforcementDeskRepository } from '../apps/api/src/modules/pedagogic-recovery/infrastructure/repositories/prisma-reinforcement-desk.repository'
import { PrismaReportRepository } from '../apps/api/src/modules/reports/infrastructure/prisma-report.repository'

// Solo una base desechable local: este script crea sus propios datos ficticios.
const url = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '55443' && url.pathname === '/dossier_test', 'Usa exclusivamente la base temporal local de consistencia en el puerto 55443')
async function main() {
  const school = await prisma.institution.create({ data: { name: 'Prueba de consistencia', code: `CONSISTENCY-${Date.now()}`, settings: { gradingConfig: { formativeReinforcement: { mode: 'period_formative', reinforcementWeight: 50, cap: 7 } } } } })
  const institutionId = school.id
  const teacher = await prisma.user.create({ data: { institutionId, email: 'teacher@test.invalid', passwordHash: 'not-a-login' } })
  const student = await prisma.user.create({ data: { institutionId, email: 'student@test.invalid', passwordHash: 'not-a-login' } })
  const actor = { userId: teacher.id, roles: ['teacher'], permissions: ['grades:write:own', 'reinforcement_cases:read:own'] }
  const dates = { startDate: new Date('2026-09-01'), endDate: new Date('2027-07-01') }
  const year = await prisma.academicYear.create({ data: { institutionId, name: '2026-2027', ...dates } })
  const scheme = await prisma.academicPeriodScheme.create({ data: { institutionId, code: 'TEST', name: 'Trimestres', periodsCount: 3 } })
  const period = await prisma.academicPeriod.create({ data: { academicYearId: year.id, schemeId: scheme.id, name: 'Primer trimestre', periodNumber: 1, ...dates } })
  const level = await prisma.level.create({ data: { institutionId, name: 'Sexto', code: 'TEST6', sortOrder: 6, subnivel: 'media' } })
  const parallel = await prisma.parallel.create({ data: { institutionId, academicYearId: year.id, levelId: level.id, name: 'B', tutorId: teacher.id } })
  const subject = await prisma.subject.create({ data: { institutionId, name: 'Ciencias Naturales' } })
  const assignment = await prisma.courseAssignment.create({ data: { institutionId, academicYearId: year.id, teacherId: teacher.id, parallelId: parallel.id, subjectId: subject.id } })
  await prisma.studentEnrollment.create({ data: { institutionId, studentId: student.id, parallelId: parallel.id, academicYearId: year.id } })
  const type = await prisma.activityType.create({ data: { institutionId, code: 'task', name: 'Actividad' } })
  const original = []
  for (const [name, score] of [['Pruebas', 2], ['Tareas', 7]] as const) {
    const insumo = await prisma.insumo.create({ data: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: period.id, name, createdBy: teacher.id } })
    const activity = await prisma.activity.create({ data: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: period.id, activityTypeId: type.id, insumoId: insumo.id, name, isPublished: true, createdBy: teacher.id } })
    await prisma.grade.create({ data: { institutionId, activityId: activity.id, studentId: student.id, score } })
    original.push(activity)
  }
  const plan = await prisma.reinforcementPlan.create({ data: { institutionId, studentId: student.id, courseAssignmentId: assignment.id, academicPeriodId: period.id, planType: 'academico', caseStatus: 'IN_REINFORCEMENT', createdBy: teacher.id } })
  const session = await prisma.reinforcementSession.create({ data: { institutionId, planId: plan.id, title: 'Resolución de problemas', date: new Date('2026-10-26'), createdBy: teacher.id, attendances: { create: { studentId: student.id, status: 'present', score: 10, scoreScaleMax: 10 } } } })
  const scope = { assignmentIds: [assignment.id], periodIds: [period.id], studentIds: [student.id], gradingScaleMax: 10 }
  const key = `${student.id}:${assignment.id}:${period.id}`
  const summary = async () => (await computePeriodGrades(institutionId, scope)).get(key)!
  assert.equal((await summary()).insumosBase, 7, 'La evidencia histórica sin aplicación separada debe entrar al cálculo')
  const notes = new PrismaActivityRepository(), reports = new PrismaReportRepository(), desk = new PrismaReinforcementDeskRepository()
  assert.equal((await reports.getGradesReport(institutionId, { courseAssignmentId: assignment.id, periodId: period.id })).students[0].summary.insumosBase, 7)
  assert.equal((await desk.detail(institutionId, actor, plan.id)).scores[0].formative, 7)
  const close = { learningTarget: 'Fracciones equivalentes', objective: 'Resolver problemas de fracciones', strategies: 'Práctica guiada', notes: 'Se revisaron las actividades realizadas', outcomes: [{ studentId: student.id, result: 'CONSOLIDATED' as const }], action: 'close' as const }
  await saveReinforcementPlan(institutionId, actor, plan.id, close)
  assert.equal((await notes.getByActivity(original[0].id, institutionId))[0].closedPlanId, plan.id)
  const change = { grades: [{ studentId: student.id, activityId: original[0].id, score: 4 }] }
  await assert.rejects(notes.bulkUpsert(institutionId, change, teacher.id), /Corregir notas/)
  await reopenReinforcementForCorrection(institutionId, actor, plan.id, 'Corregir una nota mal digitada')
  await notes.bulkUpsert(institutionId, change, teacher.id)
  await saveReinforcementRegister(institutionId, actor, plan.id, [{ sessionId: session.id, studentId: student.id, status: 'present', score: 6, expected: { status: 'present', score: 10 } }])
  assert.equal((await summary()).insumosBase, 5.75)
  await saveReinforcementPlan(institutionId, actor, plan.id, close)
  assert.equal((await summary()).insumosBase, 5.75)
  assert.equal(await prisma.reinforcementFollowUp.count({ where: { planId: plan.id } }), 1)
  assert.equal((await reports.getGradesReport(institutionId, { courseAssignmentId: assignment.id, periodId: period.id })).students[0].summary.insumosBase, 5.75)
  await assert.rejects(notes.publish(original[0].id, institutionId, false), /Corregir notas/)
  await assert.rejects(notes.update(original[0].id, institutionId, { maxScore: 20 }), /Corregir notas/)
  await new Promise((resolve) => setTimeout(resolve, 5))
  const subsequent = await prisma.activity.create({ data: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: period.id, activityTypeId: type.id, insumoId: original[0].insumoId, name: 'Nueva actividad posterior', isPublished: true, createdBy: teacher.id } })
  await notes.bulkUpsert(institutionId, { grades: [{ studentId: student.id, activityId: subsequent.id, score: 8 }] }, teacher.id)
  await notes.bulkUpsert(institutionId, { grades: [{ studentId: student.id, activityId: subsequent.id, score: 9 }] }, teacher.id)
  assert.equal((await notes.getByActivity(subsequent.id, institutionId))[0].closedPlanId, null, 'El cierre anterior no debe bloquear el trabajo posterior')
  assert.ok((await desk.list(institutionId, actor, { studentId: student.id, yearId: year.id })).some((item) => item.id === plan.id), 'La carpeta debe poder listar el plan del estudiante')
  await reopenReinforcementForCorrection(institutionId, actor, plan.id, 'Corregir asistencia o actividad')
  await assert.rejects(saveReinforcementRegister(institutionId, actor, plan.id, [
    { sessionId: session.id, studentId: student.id, score: 9, status: 'present', expected: { status: 'present', score: 6 } },
    { sessionId: session.id, studentId: 'foreign-student', score: 2, status: 'present' },
  ]), /matrícula activa/)
  assert.equal(Number((await prisma.reinforcementSessionAttendance.findUniqueOrThrow({ where: { sessionId_studentId: { sessionId: session.id, studentId: student.id } } })).score), 6, 'El lote debe revertirse completo en PostgreSQL')
  console.info('PostgreSQL: caso 4,50 + 10 → 7, resumen/plan/reportes iguales, cierre protegido, corrección registrada y rollback de lote: correctos.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
