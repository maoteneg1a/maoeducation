const { PrismaClient } = require('@prisma/client')
const { mkdir, writeFile } = require('node:fs/promises')
const path = require('node:path')
const PDFDocument = require('pdfkit')

const url = new URL(process.env.DATABASE_URL ?? '')
if (url.hostname !== '127.0.0.1' || url.port !== '55481' || url.pathname !== '/auleka_mobile_pilot') {
  throw new Error('Usa exclusivamente la base local auleka_mobile_pilot del puerto 55481')
}
const db = new PrismaClient()

async function seed() {
  const school = await db.institution.findUniqueOrThrow({ where: { code: 'ESCUELA_DEMO' } })
  const users = await db.user.findMany({ where: { institutionId: school.id }, include: { userRoles: { include: { role: true } } } })
  const guardian = users.find(user => user.email === 'padre1@escuela.edu')
  const teacher = users.find(user => user.userRoles.some(({ role }) => role.name === 'teacher'))
  const students = ['alumno1@escuela.edu', 'alumno2@escuela.edu'].map(email => users.find(user => user.email === email))
  if (!guardian || !teacher || students.some(student => !student)) throw new Error('Primero ejecuta la semilla de Escuela Demo')
  const level = await db.level.findFirstOrThrow({ where: { institutionId: school.id, code: '3B' } })
  const institutionId = school.id
  const pdf = new PDFDocument()
  const bytes = []
  pdf.on('data', chunk => bytes.push(chunk))
  const completed = new Promise((resolve, reject) => {
    pdf.once('end', () => resolve(Buffer.concat(bytes)))
    pdf.once('error', reject)
  })
  pdf.fontSize(20).text('Auleka - adjunto ficticio del piloto Android')
  pdf.end()
  const attachment = await completed
  const folder = path.join(__dirname, '../uploads/messages')
  const storedName = 'auleka-mobile-pilot.pdf'
  await mkdir(folder, { recursive: true })
  await writeFile(path.join(folder, storedName), attachment)
  await db.$transaction(async tx => {
    const year = await tx.academicYear.upsert({
      where: { institutionId_name: { institutionId, name: 'Piloto móvil' } },
      update: {},
      create: { institutionId, name: 'Piloto móvil', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-01'), isActive: true },
    })
    const subject = await tx.subject.findFirst({ where: { institutionId, name: 'Matemática piloto' } })
      ?? await tx.subject.create({ data: { institutionId, name: 'Matemática piloto' } })
    for (const [index, student] of students.entries()) {
      const academicYearId = year.id
      const name = index === 0 ? 'P-A' : 'P-B'
      const parallel = await tx.parallel.upsert({
        where: { levelId_academicYearId_name: { levelId: level.id, academicYearId, name } },
        update: {}, create: { institutionId, levelId: level.id, academicYearId, name },
      })
      const parallelId = parallel.id
      const studentId = student.id
      await tx.studentEnrollment.upsert({
        where: { studentId_academicYearId: { studentId, academicYearId } },
        update: {}, create: { institutionId, studentId, academicYearId, parallelId },
      })
      await tx.guardianStudent.upsert({
        where: { guardianId_studentId: { guardianId: guardian.id, studentId } },
        update: {}, create: { guardianId: guardian.id, studentId, isLegalRep: true },
      })
      const assignment = await tx.courseAssignment.upsert({
        where: { subjectId_parallelId_academicYearId: { subjectId: subject.id, parallelId, academicYearId } },
        update: {}, create: { institutionId, subjectId: subject.id, parallelId, academicYearId, teacherId: teacher.id },
      })
      await tx.scheduleEntry.createMany({
        data: [1, 2, 3, 4, 5].map(weekday => ({
          institutionId, courseAssignmentId: assignment.id, weekday,
          startTime: index === 0 ? '12:40' : '13:25', endTime: index === 0 ? '13:25' : '14:10',
        })),
        skipDuplicates: true,
      })
    }
    const existing = await tx.messageAttachment.findFirst({ where: { storedName } })
    if (!existing) {
      await tx.messageThread.create({ data: {
        institutionId, subject: 'Adjunto del piloto Android', createdBy: teacher.id,
        messages: { create: {
          senderId: teacher.id, body: 'Documento de prueba.',
          recipients: { create: [guardian, ...students].map(person => ({ recipientId: person.id })) },
          attachments: { create: { fileName: 'Piloto.pdf', storedName, mimeType: 'application/pdf', fileSize: attachment.length } },
        } },
      } })
    }
  })
}

seed().catch(error => {
  console.error(error.message)
  process.exitCode = 1
}).finally(() => db.$disconnect())
