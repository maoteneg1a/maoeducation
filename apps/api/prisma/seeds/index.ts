import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import {
  SYSTEM_ROLES,
  BASE_PERMISSIONS,
  ROLE_PERMISSIONS,
  DEFAULT_LEVELS,
  BASE_ACTIVITY_TYPES,
  DEFAULT_INCIDENT_TYPES,
  DEFAULT_ANAMNESIS_SCHEMA,
  DEFAULT_QUALITATIVE_SUBJECTS,
  DEFAULT_PCA_SCHEMA,
  loadKeyCompetencies,
  loadDuaCatalog,
  loadAssessmentCatalog,
  loadInsertionBanks,
  loadCurricularWorkload,
} from '../../src/modules/platform/application/services/institution-bootstrap'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // 1. Institución base
  const institution = await prisma.institution.upsert({
    where: { code: 'ESCUELA_DEMO' },
    update: {},
    create: {
      name: 'Escuela Demo',
      code: 'ESCUELA_DEMO',
      settings: {},
    },
  })
  console.log(`✓ Institution: ${institution.name}`)

  // 2. Esquema de periodos: trimestral (por defecto)
  await prisma.academicPeriodScheme.upsert({
    where: { id: 'scheme-trimester' },
    update: {},
    create: {
      id: 'scheme-trimester',
      institutionId: institution.id,
      name: 'Trimestral',
      code: 'trimester',
      periodsCount: 3,
      isDefault: true,
    },
  })
  console.log('✓ Academic period scheme: Trimestral')

  // 3. Niveles educativos
  const levels = DEFAULT_LEVELS

  for (const l of levels) {
    await prisma.level.upsert({
      where: { institutionId_code: { institutionId: institution.id, code: l.code } },
      update: {},
      create: { ...l, institutionId: institution.id },
    })
  }
  console.log(`✓ Levels: ${levels.length} niveles creados`)

  // 4. Tipos de actividad base
  const activityTypes = BASE_ACTIVITY_TYPES

  for (const t of activityTypes) {
    await prisma.activityType.upsert({
      where: { institutionId_code: { institutionId: institution.id, code: t.code } },
      update: {},
      create: { ...t, institutionId: institution.id },
    })
  }
  console.log(`✓ Activity types: ${activityTypes.length} tipos creados`)

  // 4b/4b-bis. Banco curricular MINEDUC (destrezas y competencias) — GLOBAL,
  // ya NO se siembra por institución (ver scripts/seed-global-curriculum-catalog.ts,
  // corrido una vez a nivel de plataforma).
  console.log('✓ Banco curricular (destrezas + competencias): global, sembrado por scripts/seed-global-curriculum-catalog.ts')

  // 4b-ter. Catálogos globales (no por institución): competencias clave, DUA, evaluación, inserciones
  const existingKeyCompetencies = await prisma.keyCompetency.count()
  if (existingKeyCompetencies === 0) {
    const keyCompetencies = loadKeyCompetencies()
    await prisma.keyCompetency.createMany({ data: keyCompetencies })
    console.log(`✓ Competencias clave: ${keyCompetencies.length} creadas`)
  } else {
    console.log('✓ Competencias clave: ya existían, se omite')
  }

  const existingDuaCheckpoints = await prisma.duaCheckpoint.count()
  if (existingDuaCheckpoints === 0) {
    const duaCatalog = loadDuaCatalog()
    let strategiesCount = 0
    for (const checkpoint of duaCatalog) {
      const created = await prisma.duaCheckpoint.create({
        data: {
          operationalCode: checkpoint.operationalCode,
          principleName: checkpoint.principleName,
          guidelineNumber: checkpoint.guidelineNumber,
          guidelineName: checkpoint.guidelineName,
          checkpointNumber: checkpoint.checkpointNumber,
          checkpointText: checkpoint.checkpointText,
          sortOrder: checkpoint.sortOrder,
        },
      })
      if (checkpoint.strategies.length) {
        strategiesCount += checkpoint.strategies.length
        await prisma.duaStrategy.createMany({
          data: checkpoint.strategies.map((s) => ({
            checkpointId: created.id,
            text: s.text,
            compatiblePhases: s.compatiblePhases,
            compatiblePurposes: s.compatiblePurposes,
            sourcePage: s.sourcePage,
          })),
        })
      }
    }
    console.log(`✓ Catálogo DUA: ${duaCatalog.length} checkpoints, ${strategiesCount} estrategias`)
  } else {
    console.log('✓ Catálogo DUA: ya existía, se omite')
  }

  const existingTechniques = await prisma.assessmentTechnique.count()
  if (existingTechniques === 0) {
    const assessmentCatalog = loadAssessmentCatalog()
    await prisma.assessmentTechnique.createMany({ data: assessmentCatalog.techniques })
    await prisma.assessmentInstrument.createMany({ data: assessmentCatalog.instruments })
    console.log(`✓ Catálogo de evaluación: ${assessmentCatalog.techniques.length} técnicas, ${assessmentCatalog.instruments.length} instrumentos`)
  } else {
    console.log('✓ Catálogo de evaluación: ya existía, se omite')
  }

  const existingInsertionBanks = await prisma.curricularInsertionBank.count()
  if (existingInsertionBanks === 0) {
    const insertionBanks = loadInsertionBanks()
    let candidatesCount = 0
    for (const bank of insertionBanks) {
      const created = await prisma.curricularInsertionBank.create({
        data: { key: bank.key, title: bank.title },
      })
      if (bank.candidates.length) {
        candidatesCount += bank.candidates.length
        await prisma.curricularInsertionCandidate.createMany({
          data: bank.candidates.map((c) => ({
            bankId: created.id,
            sourceCode: c.sourceCode,
            text: c.text,
            page: c.page,
          })),
        })
      }
    }
    console.log(`✓ Ejes de inserción curricular: ${insertionBanks.length} bancos, ${candidatesCount} candidatos`)
  } else {
    console.log('✓ Ejes de inserción curricular: ya existían, se omite')
  }

  const existingWorkload = await prisma.curricularWorkload.count()
  if (existingWorkload === 0) {
    const workload = loadCurricularWorkload()
    await prisma.curricularWorkload.createMany({ data: workload })
    console.log(`✓ Carga horaria oficial: ${workload.length} entradas (MINEDUC-2023-00008-A)`)
  } else {
    console.log('✓ Carga horaria oficial: ya existía, se omite')
  }

  // 4b. Tipos de falta (debido proceso)
  for (const t of DEFAULT_INCIDENT_TYPES) {
    await prisma.incidentType.upsert({
      where: { institutionId_code: { institutionId: institution.id, code: t.code } },
      update: {},
      create: { ...t, institutionId: institution.id },
    })
  }
  console.log(`✓ Incident types: ${DEFAULT_INCIDENT_TYPES.length} tipos de falta creados`)

  // 4c. Plantilla de anamnesis por defecto
  const existingTemplate = await prisma.anamnesisTemplate.findFirst({
    where: { institutionId: institution.id, isDefault: true },
  })
  if (!existingTemplate) {
    await prisma.anamnesisTemplate.create({
      data: {
        institutionId: institution.id,
        name: 'Ficha de anamnesis',
        isDefault: true,
        schema: DEFAULT_ANAMNESIS_SCHEMA as object,
      },
    })
  }
  console.log('✓ Anamnesis template: plantilla por defecto creada')

  const existingPca = await prisma.planningTemplate.findFirst({
    where: { institutionId: institution.id, type: 'pca' },
  })
  if (!existingPca) {
    await prisma.planningTemplate.create({
      data: {
        institutionId: institution.id,
        type: 'pca',
        name: 'PCA — Planificación Curricular Anual',
        isDefault: true,
        schema: DEFAULT_PCA_SCHEMA as object,
      },
    })
  }
  console.log('✓ Planning template: PCA por defecto creada')

  // 4d. Materias cualitativas por defecto (libreta)
  for (const name of DEFAULT_QUALITATIVE_SUBJECTS) {
    const exists = await prisma.subject.findFirst({ where: { institutionId: institution.id, name } })
    if (!exists) {
      await prisma.subject.create({ data: { institutionId: institution.id, name, isQualitative: true } })
    }
  }
  console.log(`✓ Qualitative subjects: ${DEFAULT_QUALITATIVE_SUBJECTS.length} materias cualitativas`)

  // 5. Roles del sistema
  const roles = SYSTEM_ROLES

  const roleMap: Record<string, string> = {}
  for (const r of roles) {
    const role = await prisma.role.upsert({
      where: { institutionId_name: { institutionId: institution.id, name: r.name } },
      update: {},
      create: { ...r, institutionId: institution.id },
    })
    roleMap[r.name] = role.id
  }
  console.log(`✓ Roles: ${roles.length} roles creados`)

  // 6. Permisos base
  const permissions = BASE_PERMISSIONS

  const permMap: Record<string, string> = {}
  for (const p of permissions) {
    const perm = await prisma.permission.upsert({
      where: { resource_action_scope: { resource: p.resource, action: p.action, scope: p.scope } },
      update: {},
      create: p,
    })
    permMap[`${p.resource}:${p.action}:${p.scope}`] = perm.id
  }
  console.log(`✓ Permissions: ${permissions.length} permisos creados`)

  // 7. Asignación de permisos a roles
  const rolePermissions = ROLE_PERMISSIONS

  for (const rp of rolePermissions) {
    const roleId = roleMap[rp.roleName]
    const permId = permMap[rp.permKey]
    if (!roleId || !permId) continue
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId, permissionId: permId } },
      update: {},
      create: { roleId, permissionId: permId },
    })
  }
  console.log('✓ Role permissions assigned')

  // 8. Usuario admin por defecto
  const adminPasswordHash = await bcrypt.hash('Admin1234!', 12)
  const adminUser = await prisma.user.upsert({
    where: { institutionId_email: { institutionId: institution.id, email: 'admin@escuela.edu' } },
    update: {},
    create: {
      institutionId: institution.id,
      email: 'admin@escuela.edu',
      passwordHash: adminPasswordHash,
      profile: {
        create: { firstName: 'Admin', lastName: 'Sistema' },
      },
    },
  })

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: roleMap['admin'] } },
    update: {},
    create: { userId: adminUser.id, roleId: roleMap['admin'] },
  })

  console.log(`✓ Admin user: admin@escuela.edu / Admin1234!`)

  // 9. Usuarios de prueba para todos los roles
  const demoPassword = await bcrypt.hash('Demo1234!', 12)

  const demoUsers = [
    { email: 'rector@escuela.edu',    firstName: 'Patricia', lastName: 'Salazar', role: 'rector' },
    { email: 'dece@escuela.edu',      firstName: 'Elena',    lastName: 'Vaca',    role: 'dece' },
    { email: 'inspector@escuela.edu', firstName: 'Carlos', lastName: 'Mendoza', role: 'inspector' },
    { email: 'profesor1@escuela.edu', firstName: 'María', lastName: 'González', role: 'teacher' },
    { email: 'profesor2@escuela.edu', firstName: 'Luis', lastName: 'Ramírez', role: 'teacher' },
    { email: 'alumno1@escuela.edu',   firstName: 'Sofía', lastName: 'Torres', role: 'student' },
    { email: 'alumno2@escuela.edu',   firstName: 'Diego', lastName: 'Flores', role: 'student' },
    { email: 'alumno3@escuela.edu',   firstName: 'Valentina', lastName: 'Castro', role: 'student' },
    { email: 'padre1@escuela.edu',    firstName: 'Jorge', lastName: 'Torres', role: 'guardian' },
  ]

  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { institutionId_email: { institutionId: institution.id, email: u.email } },
      update: {},
      create: {
        institutionId: institution.id,
        email: u.email,
        passwordHash: demoPassword,
        profile: { create: { firstName: u.firstName, lastName: u.lastName } },
      },
    })
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: roleMap[u.role] } },
      update: {},
      create: { userId: user.id, roleId: roleMap[u.role] },
    })
  }
  console.log(`✓ Demo users: ${demoUsers.length} usuarios creados (contraseña: Demo1234!)`)

  // 10. Superadmin de plataforma (NO pertenece a ninguna institución)
  const platformPasswordHash = await bcrypt.hash('Super1234!', 12)
  await prisma.platformAdmin.upsert({
    where: { email: 'superadmin@mao.edu' },
    update: {},
    create: {
      email: 'superadmin@mao.edu',
      passwordHash: platformPasswordHash,
      name: 'Superadmin',
    },
  })
  console.log('✓ Platform superadmin: superadmin@mao.edu / Super1234!')

  console.log('\n✅ Seed completado exitosamente')
}

main()
  .catch((e) => { console.error('❌ Seed error:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
