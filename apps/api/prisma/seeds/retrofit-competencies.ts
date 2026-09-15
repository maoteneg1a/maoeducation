/**
 * Retrofit del banco de competencias (CNC-MINEDUC) + catálogos globales (DUA,
 * evaluación, inserción curricular, competencias clave) para instituciones que
 * YA EXISTÍAN antes de agregar el modelo por competencias — bootstrapInstitution
 * solo siembra esto en instituciones NUEVAS, así que las ya creadas (ej. Panamá
 * en producción) se quedaron sin este banco aunque el resto del sistema (schema,
 * endpoints, UI) ya lo soporte.
 *
 * Idempotente: por institución, si ya tiene CompetencyArea no hace nada; los
 * catálogos globales (KeyCompetency, DuaCheckpoint, AssessmentTechnique,
 * CurricularInsertionBank) se siembran una sola vez para toda la plataforma.
 *
 * Uso:
 *   cd apps/api
 *   npx tsx prisma/seeds/retrofit-competencies.ts
 *
 * En producción (Railway):
 *   railway run --service api npx tsx prisma/seeds/retrofit-competencies.ts
 */
import { PrismaClient } from '@prisma/client'
import {
  loadDefaultCompetencies,
  loadKeyCompetencies,
  loadDuaCatalog,
  loadAssessmentCatalog,
  loadInsertionBanks,
  loadCurricularWorkload,
} from '../../src/modules/platform/application/services/institution-bootstrap'

const prisma = new PrismaClient()

async function seedCompetencyBankForInstitution(institutionId: string, institutionName: string) {
  const existing = await prisma.competencyArea.count({ where: { institutionId } })
  if (existing > 0) {
    console.log(`  ✓ ${institutionName}: banco por competencias ya existía, se omite`)
    return
  }

  const defaultCompetencies = loadDefaultCompetencies()
  let competenciesCount = 0
  for (const area of defaultCompetencies) {
    const createdArea = await prisma.competencyArea.create({
      data: { institutionId, code: area.code, name: area.name },
    })
    for (const [subnivel, competencies] of Object.entries(area.subniveles)) {
      for (const competency of competencies) {
        competenciesCount++
        const createdCompetency = await prisma.competency.create({
          data: {
            areaId: createdArea.id,
            subnivel,
            code: competency.code,
            text: competency.text,
            keyCompetencyCodes: competency.keyCompetencyCodes,
          },
        })
        if (competency.indicators.length) {
          await prisma.competencyIndicator.createMany({
            data: competency.indicators.map((ind) => ({
              competencyId: createdCompetency.id,
              code: ind.code,
              text: ind.text,
            })),
          })
        }
        if (competency.sabers.length) {
          await prisma.competencySaber.createMany({
            data: competency.sabers.map((saber) => ({
              competencyId: createdCompetency.id,
              type: saber.type,
              code: saber.code,
              description: saber.description,
            })),
          })
        }
      }
    }
  }
  console.log(`  ✓ ${institutionName}: ${defaultCompetencies.length} áreas, ${competenciesCount} competencias`)
}

async function main() {
  console.log('🌱 Retrofit: banco de competencias + catálogos globales')

  // 1. Catálogos globales (una sola vez para toda la plataforma)
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

  // 2. Banco de competencias por institución — para CADA institución existente
  const institutions = await prisma.institution.findMany({ select: { id: true, name: true } })
  console.log(`\n🏫 Sembrando banco por competencias para ${institutions.length} institución(es):`)
  for (const inst of institutions) {
    await seedCompetencyBankForInstitution(inst.id, inst.name)
  }

  console.log('\n✅ Retrofit completado exitosamente')
}

main()
  .catch((e) => {
    console.error('❌ Retrofit error:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
