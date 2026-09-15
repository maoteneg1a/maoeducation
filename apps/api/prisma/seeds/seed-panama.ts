/**
 * Seed de institución REAL para producción: "ESCUELA DE EDUCACIÓN BÁSICA PANAMÁ".
 *
 * Crea la institución con toda la configuración por defecto (roles, permisos,
 * esquema trimestral, niveles/subniveles, banco curricular MINEDUC, plantillas
 * PCA, tipos de actividad/incidente, materias cualitativas — vía bootstrapInstitution,
 * la misma función que usa el superadmin al crear una institución desde la UI),
 * más los datos operativos mínimos para probar el sistema de punta a punta:
 * año lectivo 2026-2027, un paralelo (5to de Básica "A" - Matutina), la docente
 * titular, el resto de roles (rector/inspector/DECE), y 2 estudiantes con sus
 * representantes.
 *
 * Idempotente: se puede correr varias veces (en local o en prod) sin duplicar nada
 * — cada bloque verifica existencia antes de crear.
 *
 * Uso:
 *   cd apps/api
 *   npx tsx prisma/seeds/seed-panama.ts
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { bootstrapInstitution } from '../../src/modules/platform/application/services/institution-bootstrap'

const prisma = new PrismaClient()

const INSTITUTION_CODE = 'PANAMA_EB'
const INSTITUTION_NAME = 'Escuela de Educación Básica "Panamá"'

// Contraseñas temporales — se debe pedir a cada usuario cambiarla en su primer ingreso.
const DEFAULT_PASSWORD = 'Panama2026!'

async function hash(pw: string) {
  return bcrypt.hash(pw, 12)
}

async function main() {
  console.log(`🌱 Seed institución real: ${INSTITUTION_NAME}`)

  // 1. Institución + toda la config por defecto (idempotente: si ya existe, se reusa)
  let institution = await prisma.institution.findUnique({ where: { code: INSTITUTION_CODE } })
  let adminUserId: string

  if (!institution) {
    const result = await prisma.$transaction((tx) =>
      bootstrapInstitution(
        tx,
        { name: INSTITUTION_NAME, code: INSTITUTION_CODE },
        {
          email: 'admin@panama.edu.ec',
          password: DEFAULT_PASSWORD,
          firstName: 'Administración',
          lastName: 'Panamá',
        },
        'COSTA_GALAPAGOS',
      ),
    )
    institution = await prisma.institution.findUniqueOrThrow({ where: { id: result.institutionId } })
    adminUserId = result.adminUserId
    console.log(`✓ Institución creada: ${institution.name} (${institution.code})`)
  } else {
    const admin = await prisma.user.findFirst({
      where: { institutionId: institution.id, userRoles: { some: { role: { name: 'admin' } } } },
    })
    adminUserId = admin!.id
    console.log('✓ Institución ya existía, se reusa')
  }
  const institutionId = institution.id

  const roles = await prisma.role.findMany({ where: { institutionId } })
  const roleId = (name: string) => roles.find((r) => r.name === name)!.id

  // 2. Año lectivo 2026-2027 (régimen Costa) + periodos trimestrales
  let year = await prisma.academicYear.findFirst({ where: { institutionId, name: '2026-2027' } })
  if (!year) {
    year = await prisma.academicYear.create({
      data: {
        institutionId,
        name: '2026-2027',
        startDate: new Date('2026-05-04'),
        endDate: new Date('2027-02-24'),
        isActive: true,
      },
    })
    console.log('✓ Año lectivo 2026-2027 creado')
  }

  const scheme = await prisma.academicPeriodScheme.findFirst({ where: { institutionId, isDefault: true } })
  const periodDefs = [
    { periodNumber: 1, name: 'Primer Trimestre', startDate: '2026-05-04', endDate: '2026-08-14', isActive: false },
    { periodNumber: 2, name: 'Segundo Trimestre', startDate: '2026-08-17', endDate: '2026-11-13', isActive: false },
    { periodNumber: 3, name: 'Tercer Trimestre', startDate: '2026-11-16', endDate: '2027-02-24', isActive: true },
  ]
  const periods: Record<number, string> = {}
  for (const p of periodDefs) {
    let period = await prisma.academicPeriod.findFirst({ where: { academicYearId: year.id, periodNumber: p.periodNumber } })
    if (!period) {
      period = await prisma.academicPeriod.create({
        data: {
          academicYearId: year.id,
          schemeId: scheme!.id,
          periodNumber: p.periodNumber,
          name: p.name,
          startDate: new Date(p.startDate),
          endDate: new Date(p.endDate),
          isActive: p.isActive,
        },
      })
    } else if (period.isActive !== p.isActive) {
      // bootstrapInstitution ya crea el año+períodos (marcando activo el 1ro por
      // defecto) — si este seed pide un período distinto como activo, se corrige.
      period = await prisma.academicPeriod.update({ where: { id: period.id }, data: { isActive: p.isActive } })
    }
    periods[p.periodNumber] = period.id
  }
  console.log('✓ Periodos trimestrales listos')

  // 3. Nivel "5to de Básica" (ya viene del bootstrap) + paralelo "A" (jornada Matutina)
  const level5B = await prisma.level.findFirst({ where: { institutionId, code: '5B' } })
  if (!level5B) throw new Error('Nivel 5B no encontrado — revisa DEFAULT_LEVELS en institution-bootstrap.ts')

  let parallelA = await prisma.parallel.findFirst({
    where: { institutionId, levelId: level5B.id, academicYearId: year.id, name: 'A' },
  })
  if (!parallelA) {
    parallelA = await prisma.parallel.create({
      data: { institutionId, levelId: level5B.id, academicYearId: year.id, name: 'A' },
    })
    console.log('✓ Paralelo 5to de Básica "A" (Matutina) creado')
  }

  // 4. Usuarios: docente titular + rector + inspector + DECE
  async function upsertUser(opts: {
    email: string
    firstName: string
    lastName: string
    dni?: string
    roleName: string
  }) {
    let user = await prisma.user.findFirst({ where: { institutionId, email: opts.email } })
    if (!user) {
      user = await prisma.user.create({
        data: {
          institutionId,
          email: opts.email,
          passwordHash: await hash(DEFAULT_PASSWORD),
          profile: { create: { firstName: opts.firstName, lastName: opts.lastName, dni: opts.dni } },
        },
      })
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleId(opts.roleName) } })
      console.log(`✓ Usuario creado: ${opts.email} (${opts.roleName})`)
    }
    return user
  }

  const hilda = await upsertUser({
    email: 'hilda.zhangallimbay@panama.edu.ec',
    firstName: 'Hilda Rosario',
    lastName: 'Zhangallimbay Guzñay',
    dni: '0106041734',
    roleName: 'teacher',
  })
  await upsertUser({
    email: 'rector@panama.edu.ec',
    firstName: 'Rector(a)',
    lastName: 'Panamá',
    roleName: 'rector',
  })
  await upsertUser({
    email: 'inspector@panama.edu.ec',
    firstName: 'Inspector(a)',
    lastName: 'Panamá',
    roleName: 'inspector',
  })
  await upsertUser({
    email: 'dece@panama.edu.ec',
    firstName: 'DECE',
    lastName: 'Panamá',
    roleName: 'dece',
  })

  // Hilda es tutora del paralelo (para que aparezca como docente principal en reportes)
  if (!parallelA.tutorId) {
    await prisma.parallel.update({ where: { id: parallelA.id }, data: { tutorId: hilda.id } })
  }

  // 5. Materias del banco curricular + asignaciones de curso (mismo paralelo, distintos
  // docentes) — para poder probar Proyectos Interdisciplinarios, que requieren ≥2 materias.
  async function upsertSubjectAndAssignment(opts: {
    subjectCode: string
    subjectName: string
    areaCode: string
    teacherId: string
  }) {
    const area = await prisma.curriculumArea.findFirst({ where: { institutionId, code: opts.areaCode } })
    let subject = await prisma.subject.findFirst({ where: { institutionId, code: opts.subjectCode } })
    if (!subject) {
      subject = await prisma.subject.create({
        data: { institutionId, name: opts.subjectName, code: opts.subjectCode, curriculumAreaId: area?.id },
      })
      console.log(`✓ Materia ${opts.subjectName} (5to Básica) creada`)
    }
    // CourseAssignment es único por (subjectId, parallelId, academicYearId) sin importar el
    // docente — se busca por esa combinación, no por teacherId, para no intentar duplicarla.
    let assignment = await prisma.courseAssignment.findFirst({
      where: { institutionId, subjectId: subject.id, parallelId: parallelA.id, academicYearId: year.id },
    })
    if (!assignment) {
      assignment = await prisma.courseAssignment.create({
        data: { institutionId, teacherId: opts.teacherId, subjectId: subject.id, parallelId: parallelA.id, academicYearId: year.id },
      })
      console.log(`✓ Asignación de curso creada: ${opts.subjectName}, 5to Básica A`)
    }
    return { subject, assignment }
  }

  const damian = await upsertUser({
    email: 'damian.torres@panama.edu.ec',
    firstName: 'Damián',
    lastName: 'Torres',
    roleName: 'teacher',
  })
  const carla = await upsertUser({
    email: 'carla.jimenez@panama.edu.ec',
    firstName: 'Carla',
    lastName: 'Jiménez',
    roleName: 'teacher',
  })

  // Hilda, como en la realidad de EGB, dicta varias materias al mismo paralelo.
  // Nota: CourseAssignment es único por (subjectId, parallelId, academicYearId) — un solo
  // docente por materia por paralelo por año, así que cada materia va a un único docente.
  await upsertSubjectAndAssignment({
    subjectCode: 'MAT-5B',
    subjectName: 'Matemática',
    areaCode: 'M',
    teacherId: hilda.id,
  })
  await upsertSubjectAndAssignment({
    subjectCode: 'CS-5B',
    subjectName: 'Ciencias Sociales',
    areaCode: 'CS',
    teacherId: hilda.id,
  })
  await upsertSubjectAndAssignment({
    subjectCode: 'LL-5B',
    subjectName: 'Lengua y Literatura',
    areaCode: 'LL',
    teacherId: damian.id,
  })
  await upsertSubjectAndAssignment({
    subjectCode: 'ECA-5B',
    subjectName: 'Educación Cultural y Artística',
    areaCode: 'ECA',
    teacherId: damian.id,
  })
  await upsertSubjectAndAssignment({
    subjectCode: 'CN-5B',
    subjectName: 'Ciencias Naturales',
    areaCode: 'CN',
    teacherId: carla.id,
  })
  await upsertSubjectAndAssignment({
    subjectCode: 'EF-5B',
    subjectName: 'Educación Física',
    areaCode: 'EF',
    teacherId: carla.id,
  })

  // 6. Estudiantes de prueba + representantes
  async function upsertStudentWithGuardian(opts: {
    studentEmail: string
    studentFirstName: string
    studentLastName: string
    studentDni: string
    guardianEmail: string
    guardianFirstName: string
    guardianLastName: string
    guardianDni: string
    guardianPhone: string
    relationship: string
  }) {
    let student = await prisma.user.findFirst({ where: { institutionId, email: opts.studentEmail } })
    if (!student) {
      student = await prisma.user.create({
        data: {
          institutionId,
          email: opts.studentEmail,
          passwordHash: await hash(DEFAULT_PASSWORD),
          profile: { create: { firstName: opts.studentFirstName, lastName: opts.studentLastName, dni: opts.studentDni } },
        },
      })
      await prisma.userRole.create({ data: { userId: student.id, roleId: roleId('student') } })
    }

    const existingEnrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId: student.id, academicYearId: year.id },
    })
    if (!existingEnrollment) {
      await prisma.studentEnrollment.create({
        data: { institutionId, studentId: student.id, parallelId: parallelA.id, academicYearId: year.id },
      })
    }

    let guardian = await prisma.user.findFirst({ where: { institutionId, email: opts.guardianEmail } })
    if (!guardian) {
      guardian = await prisma.user.create({
        data: {
          institutionId,
          email: opts.guardianEmail,
          passwordHash: await hash(DEFAULT_PASSWORD),
          profile: {
            create: {
              firstName: opts.guardianFirstName,
              lastName: opts.guardianLastName,
              dni: opts.guardianDni,
              phone: opts.guardianPhone,
            },
          },
        },
      })
      await prisma.userRole.create({ data: { userId: guardian.id, roleId: roleId('guardian') } })
    }

    const existingLink = await prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId: guardian.id, studentId: student.id } },
    })
    if (!existingLink) {
      await prisma.guardianStudent.create({
        data: {
          guardianId: guardian.id,
          studentId: student.id,
          relationship: opts.relationship,
          isPrimary: true,
          isLegalRep: true,
          livesWithStudent: true,
        },
      })
    }
    console.log(`✓ Estudiante ${opts.studentFirstName} ${opts.studentLastName} + representante ${opts.guardianFirstName} listos`)
  }

  await upsertStudentWithGuardian({
    studentEmail: 'estudiante1@panama.edu.ec',
    studentFirstName: 'Ana',
    studentLastName: 'Morocho Quinde',
    studentDni: '0107001111',
    guardianEmail: 'representante1@panama.edu.ec',
    guardianFirstName: 'Carlos',
    guardianLastName: 'Morocho Vega',
    guardianDni: '0107002222',
    guardianPhone: '0987654321',
    relationship: 'padre',
  })

  await upsertStudentWithGuardian({
    studentEmail: 'estudiante2@panama.edu.ec',
    studentFirstName: 'Luis',
    studentLastName: 'Guzñay Pintado',
    studentDni: '0107003333',
    guardianEmail: 'representante2@panama.edu.ec',
    guardianFirstName: 'Rosa',
    guardianLastName: 'Pintado Léon',
    guardianDni: '0107004444',
    guardianPhone: '0912345678',
    relationship: 'madre',
  })

  console.log('\n✅ Seed de Escuela Panamá completado')
  console.log('\n--- Credenciales (institución: ' + INSTITUTION_CODE + ') ---')
  console.log(`Admin:        admin@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`Docente (Matemática, Ciencias Sociales):        hilda.zhangallimbay@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`Docente (Lengua y Literatura, Ed. Cultural):    damian.torres@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`Docente (Ciencias Naturales, Ed. Física):       carla.jimenez@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`Rector:       rector@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`Inspector:    inspector@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`DECE:         dece@panama.edu.ec / ${DEFAULT_PASSWORD}`)
  console.log(`Estudiante 1: estudiante1@panama.edu.ec / ${DEFAULT_PASSWORD} (Ana Morocho Quinde)`)
  console.log(`Representante 1: representante1@panama.edu.ec / ${DEFAULT_PASSWORD} (Carlos Morocho Vega, padre)`)
  console.log(`Estudiante 2: estudiante2@panama.edu.ec / ${DEFAULT_PASSWORD} (Luis Guzñay Pintado)`)
  console.log(`Representante 2: representante2@panama.edu.ec / ${DEFAULT_PASSWORD} (Rosa Pintado León, madre)`)
  console.log('\n⚠️  Todas las contraseñas son temporales — pedir cambio en el primer ingreso.')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
