/**
 * Siembra el catálogo curricular oficial MINEDUC (destrezas y competencias)
 * como GLOBAL — una sola copia compartida por todas las instituciones, en vez
 * de una copia idéntica por institución (comportamiento anterior de
 * `bootstrapInstitution`, que insertaba ~7,000 filas repetidas en cada
 * registro nuevo).
 *
 * Idempotente: busca cada área por `code` antes de crearla; si ya existe, la
 * reusa (no duplica). Corre una sola vez a nivel de plataforma — nunca por
 * institución. `bootstrapInstitution` ya no siembra este catálogo, lo asume
 * pre-sembrado.
 *
 * Uso: DATABASE_URL=... npx tsx scripts/seed-global-curriculum-catalog.ts
 */
import { PrismaClient } from '@prisma/client'
import { loadDefaultCurriculum, loadDefaultCompetencies } from '../src/modules/platform/application/services/institution-bootstrap'

const prisma = new PrismaClient()

async function seedCurriculum() {
  const areas = loadDefaultCurriculum()
  let createdAreas = 0
  let createdCriteria = 0
  let createdSkills = 0

  for (const area of areas) {
    let dbArea = await prisma.curriculumArea.findUnique({ where: { code: area.code } })
    if (!dbArea) {
      dbArea = await prisma.curriculumArea.create({ data: { code: area.code, name: area.name } })
      createdAreas++
    }

    for (const [subnivel, criteria] of Object.entries(area.subniveles)) {
      for (const criterion of criteria) {
        let dbCriterion = await prisma.curriculumCriterion.findFirst({
          where: { areaId: dbArea.id, subnivel, code: criterion.code },
        })
        if (!dbCriterion) {
          dbCriterion = await prisma.curriculumCriterion.create({
            data: { areaId: dbArea.id, subnivel, code: criterion.code, description: criterion.description },
          })
          createdCriteria++
        }

        for (const skill of criterion.skills) {
          const exists = await prisma.curriculumSkill.findFirst({ where: { criterionId: dbCriterion.id, code: skill.code } })
          if (exists) continue
          await prisma.curriculumSkill.create({
            data: {
              criterionId: dbCriterion.id,
              code: skill.code,
              description: skill.description,
              indicatorText: skill.indicatorText,
              profileRefs: skill.profileRefs,
              competencyTags: [],
              insercionTags: [],
            },
          })
          createdSkills++
        }
      }
    }
  }

  console.log(`Destrezas: ${createdAreas} áreas nuevas, ${createdCriteria} criterios nuevos, ${createdSkills} destrezas nuevas`)
}

async function seedCompetencies() {
  const areas = loadDefaultCompetencies()
  let createdAreas = 0
  let createdCompetencies = 0
  let createdIndicators = 0
  let createdSabers = 0

  for (const area of areas) {
    let dbArea = await prisma.competencyArea.findUnique({ where: { code: area.code } })
    if (!dbArea) {
      dbArea = await prisma.competencyArea.create({ data: { code: area.code, name: area.name } })
      createdAreas++
    }

    for (const [subnivel, competencies] of Object.entries(area.subniveles)) {
      for (const competency of competencies) {
        let dbCompetency = await prisma.competency.findFirst({
          where: { areaId: dbArea.id, subnivel, code: competency.code },
        })
        if (!dbCompetency) {
          dbCompetency = await prisma.competency.create({
            data: {
              areaId: dbArea.id,
              subnivel,
              code: competency.code,
              text: competency.text,
              keyCompetencyCodes: competency.keyCompetencyCodes,
            },
          })
          createdCompetencies++
        }

        for (const ind of competency.indicators) {
          const exists = await prisma.competencyIndicator.findFirst({ where: { competencyId: dbCompetency.id, code: ind.code } })
          if (exists) continue
          await prisma.competencyIndicator.create({ data: { competencyId: dbCompetency.id, code: ind.code, text: ind.text } })
          createdIndicators++
        }

        for (const saber of competency.sabers) {
          const exists = await prisma.competencySaber.findFirst({ where: { competencyId: dbCompetency.id, code: saber.code } })
          if (exists) continue
          await prisma.competencySaber.create({
            data: { competencyId: dbCompetency.id, type: saber.type, code: saber.code, description: saber.description },
          })
          createdSabers++
        }
      }
    }
  }

  console.log(
    `Competencias: ${createdAreas} áreas nuevas, ${createdCompetencies} competencias nuevas, ${createdIndicators} indicadores nuevos, ${createdSabers} saberes nuevos`,
  )
}

async function main() {
  console.log('Seed del catálogo curricular GLOBAL (destrezas + competencias)\n')
  await seedCurriculum()
  await seedCompetencies()
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Error en seed global:', e)
  process.exit(1)
})
