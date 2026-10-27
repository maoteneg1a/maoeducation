import assert from 'node:assert/strict'
import { prisma } from '../apps/api/src/shared/infrastructure/database/prisma'
import { createOwnInsumos } from '../apps/api/src/modules/activities/application/services/create-own-insumos.service'
const url = new URL(process.env.DATABASE_URL ?? '')
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && url.port === '55443' && url.pathname === '/dossier_test', 'Usa exclusivamente la base temporal local en el puerto 55443')
async function main() {
  const school = await prisma.institution.create({ data: { name: 'Prueba de insumos propios', code: `OWN-INSUMOS-${Date.now()}`, settings: { gradingConfig: { formativeReinforcement: { mode: 'period_formative', reinforcementWeight: 50, cap: 7 } } } } })
  const institutionId = school.id
  const teacher = await prisma.user.create({ data: { institutionId, email: 'teacher@test.invalid', passwordHash: 'not-a-login' } })
  const student = await prisma.user.create({ data: { institutionId, email: 'student@test.invalid', passwordHash: 'not-a-login' } })
  const dates = { startDate: new Date('2026-09-01'), endDate: new Date('2027-07-01') }
  const year = await prisma.academicYear.create({ data: { institutionId, name: '2026-2027', ...dates } })
  const scheme = await prisma.academicPeriodScheme.create({ data: { institutionId, code: 'TEST', name: 'Trimestres', periodsCount: 3 } })
  const period = await prisma.academicPeriod.create({ data: { academicYearId: year.id, schemeId: scheme.id, name: 'Primer trimestre', periodNumber: 1, ...dates } })
  const level = await prisma.level.create({ data: { institutionId, name: 'Sexto', code: 'TEST6', sortOrder: 6, subnivel: 'media' } })
  const parallel = await prisma.parallel.create({ data: { institutionId, academicYearId: year.id, levelId: level.id, name: 'B', tutorId: teacher.id } })
  const subject = await prisma.subject.create({ data: { institutionId, name: 'Ciencias Naturales' } })
  const assignment = await prisma.courseAssignment.create({ data: { institutionId, academicYearId: year.id, teacherId: teacher.id, parallelId: parallel.id, subjectId: subject.id } })

  const ownActor = { userId: teacher.id, roles: ['teacher'], permissions: ['insumos:write:own'] }
  const secondSubject = await prisma.subject.create({ data: { institutionId, name: 'Matemáticas' } })
  const second = await prisma.courseAssignment.create({ data: { institutionId, academicYearId: year.id, teacherId: teacher.id, parallelId: parallel.id, subjectId: secondSubject.id } })
  const existing = await prisma.insumo.create({ data: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: period.id, name: 'Deberes', weight: 40, createdBy: teacher.id } })
  const input = { periodId: period.id, courseAssignmentIds: [assignment.id, second.id], names: ['Deberes', 'Lecciones'] }
  const results = await Promise.all([createOwnInsumos(institutionId, ownActor, input), createOwnInsumos(institutionId, ownActor, input)])
  assert.equal(results.reduce((sum, item) => sum + item.created, 0), 3, 'Dos envíos concurrentes solo crean los faltantes una vez')
  assert.equal(await prisma.insumo.count({ where: { institutionId } }), 4)
  assert.equal(Number((await prisma.insumo.findUniqueOrThrow({ where: { id: existing.id } })).weight), 40, 'Los insumos anteriores conservan su peso')
  const foreignSubject = await prisma.subject.create({ data: { institutionId, name: 'Otra materia' } })
  const foreign = await prisma.courseAssignment.create({ data: { institutionId, academicYearId: year.id, teacherId: student.id, parallelId: parallel.id, subjectId: foreignSubject.id } })
  await assert.rejects(createOwnInsumos(institutionId, ownActor, { ...input, names: ['No debe crearse'], courseAssignmentIds: [assignment.id, foreign.id] }), /propias materias/)
  assert.equal(await prisma.insumo.count({ where: { institutionId, name: 'No debe crearse' } }), 0, 'No hay escrituras parciales')
  await prisma.academicPeriod.update({ where: { id: period.id }, data: { isClosed: true } })
  await assert.rejects(createOwnInsumos(institutionId, ownActor, input), /período abierto/)
  console.info('PostgreSQL: materias propias, lote atómico, envíos concurrentes sin duplicados, pesos conservados y período cerrado: correctos.')
}
main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(() => prisma.$disconnect())
