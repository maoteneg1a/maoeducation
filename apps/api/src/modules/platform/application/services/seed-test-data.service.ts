import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors/app.errors'
import bcrypt from 'bcryptjs'

const TEST_PASSWORD = 'Prueba1234!'

interface SeedResult {
  parallelName: string
  teacherEmails: string[]
  studentEmails: string[]
  password: string
}

/**
 * Puebla una institución YA existente (creada vía bootstrapInstitution, con año
 * lectivo/niveles/banco curricular ya sembrados) con datos operativos de ejemplo
 * — mismo patrón que prisma/seeds/seed-panama.ts pero invocable desde el panel de
 * superadmin en vez de por línea de comandos, y genérico (no atado a una escuela
 * real). Idempotente: se puede correr varias veces sin duplicar nada.
 *
 * Solo permitido en instituciones marcadas settings.isTestInstitution=true — el
 * admin apaga esa marca cuando la institución ya es una escuela real, y el botón
 * (y este endpoint) deja de estar disponible.
 */
export async function seedTestData(institutionId: string): Promise<SeedResult> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId } })
  if (!institution) throw new NotFoundError('Institución no encontrada')
  const settings = (institution.settings ?? {}) as { isTestInstitution?: boolean }
  if (settings.isTestInstitution === false) {
    throw new ConflictError('Esta institución ya no está marcada como de prueba — no se pueden sembrar datos de ejemplo')
  }

  const year = await prisma.academicYear.findFirst({ where: { institutionId, isActive: true } })
  if (!year) throw new ConflictError('No hay año lectivo activo — créalo antes de sembrar datos de prueba')
  const yearId = year.id

  const level = await prisma.level.findFirst({ where: { institutionId, code: '5B' } })
  if (!level) throw new ConflictError('Nivel 5B no encontrado — la institución no se bootstrapeó correctamente')

  const roles = await prisma.role.findMany({ where: { institutionId } })
  const roleId = (name: string) => {
    const role = roles.find((r) => r.name === name)
    if (!role) throw new ConflictError(`Rol "${name}" no existe en esta institución`)
    return role.id
  }

  const domain = institution.code.toLowerCase().replace(/[^a-z0-9]/g, '')
  const emailFor = (localPart: string) => `${localPart}.prueba@${domain}.test`
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12)

  async function upsertUser(opts: { email: string; firstName: string; lastName: string; roleName: string }) {
    let user = await prisma.user.findFirst({ where: { institutionId, email: opts.email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          institutionId,
          email: opts.email,
          passwordHash,
          profile: { create: { firstName: opts.firstName, lastName: opts.lastName } },
        },
      })
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleId(opts.roleName) } })
    }
    return user
  }

  let parallel = await prisma.parallel.findFirst({
    where: { institutionId, levelId: level.id, academicYearId: yearId, name: 'A' },
  })
  if (!parallel) {
    parallel = await prisma.parallel.create({
      data: { institutionId, levelId: level.id, academicYearId: yearId, name: 'A' },
    })
  }

  const teacher1 = await upsertUser({ email: emailFor('docente1'), firstName: 'Docente', lastName: 'Uno', roleName: 'teacher' })
  const teacher2 = await upsertUser({ email: emailFor('docente2'), firstName: 'Docente', lastName: 'Dos', roleName: 'teacher' })

  if (!parallel.tutorId) {
    await prisma.parallel.update({ where: { id: parallel.id }, data: { tutorId: teacher1.id } })
  }

  async function upsertSubjectAndAssignment(opts: { subjectCode: string; subjectName: string; areaCode: string; teacherId: string }) {
    const area = await prisma.curriculumArea.findFirst({ where: { code: opts.areaCode } })
    let subject = await prisma.subject.findFirst({ where: { institutionId, code: opts.subjectCode } })
    if (!subject) {
      subject = await prisma.subject.create({
        data: { institutionId, name: opts.subjectName, code: opts.subjectCode, curriculumAreaId: area?.id },
      })
    }
    const existingAssignment = await prisma.courseAssignment.findFirst({
      where: { institutionId, subjectId: subject.id, parallelId: parallel!.id, academicYearId: yearId },
    })
    if (!existingAssignment) {
      await prisma.courseAssignment.create({
        data: { institutionId, teacherId: opts.teacherId, subjectId: subject.id, parallelId: parallel!.id, academicYearId: yearId },
      })
    }
  }

  await upsertSubjectAndAssignment({ subjectCode: 'MAT-5B-T', subjectName: 'Matemática', areaCode: 'M', teacherId: teacher1.id })
  await upsertSubjectAndAssignment({ subjectCode: 'LL-5B-T', subjectName: 'Lengua y Literatura', areaCode: 'LL', teacherId: teacher1.id })
  await upsertSubjectAndAssignment({ subjectCode: 'CN-5B-T', subjectName: 'Ciencias Naturales', areaCode: 'CN', teacherId: teacher2.id })
  await upsertSubjectAndAssignment({ subjectCode: 'CS-5B-T', subjectName: 'Ciencias Sociales', areaCode: 'CS', teacherId: teacher2.id })

  const studentDefs = [
    { first: 'Estudiante', last: 'Uno', local: 'alumno1' },
    { first: 'Estudiante', last: 'Dos', local: 'alumno2' },
    { first: 'Estudiante', last: 'Tres', local: 'alumno3' },
  ]
  const studentEmails: string[] = []
  for (const def of studentDefs) {
    const email = emailFor(def.local)
    const student = await upsertUser({ email, firstName: def.first, lastName: def.last, roleName: 'student' })
    const existingEnrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: student.id, academicYearId: yearId },
    })
    if (!existingEnrollment) {
      await prisma.studentEnrollment.create({
        data: { institutionId, studentId: student.id, parallelId: parallel.id, academicYearId: yearId },
      })
    }
    studentEmails.push(email)
  }

  return {
    parallelName: `${level.name} ${parallel.name}`,
    teacherEmails: [teacher1.email, teacher2.email],
    studentEmails,
    password: TEST_PASSWORD,
  }
}
