/**
 * Completa el catálogo global de CompetencySaber con los saberes que la
 * fuente oficial TIGA (`data/cnc_multigrade/<materia>/*.json`, formato 1:
 * mathematics, language_literature, natural_sciences,
 * cultural_artistic_education, social_studies) define para una competencia
 * pero que nunca se importaron al seed (`default-competencies.json`).
 *
 * Contexto: el seed original solo trajo un subconjunto de los saberes reales
 * por competencia (ver reporte: 888 faltantes en 116 de 284 competencias de
 * estas 5 materias EGB) — no es el mismo bug que gradeCodes vacío
 * (import-tiga-grade-granularity.ts), que solo ETIQUETA lo que ya existe.
 * Este script CREA lo que falta, con su gradeCodes ya puesto según el grado
 * real de TIGA (ej. un saber que en TIGA solo aplica a 6EGB/7EGB se crea con
 * gradeCodes:["6B","7B"], no con el array vacío que significa "todo el
 * subnivel").
 *
 * Los saberes que YA EXISTÍAN en la BD (aunque su gradeCodes sea [] = "todo
 * el subnivel", posiblemente incorrecto) NO se tocan — decisión explícita:
 * cero riesgo de romper planificaciones ya generadas contra ese saber.
 *
 * Idempotente: busca por (competencyId, code) antes de crear; correrlo N
 * veces no duplica.
 *
 * Uso:
 *   cd apps/api
 *   DATABASE_URL="postgresql://maoedu:maoedu_dev@localhost:5433/maoeducation" \
 *     npx tsx scripts/import-tiga-missing-sabers.ts
 *
 * TIGA_DATA_DIR configurable igual que import-tiga-grade-granularity.ts.
 */
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const TIGA_DATA_DIR = process.env.TIGA_DATA_DIR ?? '/Users/mtene/Downloads/sistema_portafolio_docente/data/cnc_multigrade'

/** Mismo mapeo que import-tiga-grade-granularity.ts — "6EGB" -> "6B", "2BGU" -> "2BGU". */
function mapGradeCode(tigaGradeCode: string | undefined | null): string | null {
  if (!tigaGradeCode) return null
  const egbMatch = /^(\d{1,2})EGB$/.exec(tigaGradeCode)
  if (egbMatch) return `${egbMatch[1]}B`
  if (/^[1-3]BGU$/.test(tigaGradeCode)) return tigaGradeCode
  return null
}

function normalizeCompetencyCode(code: string): string {
  return code.replace(/^CE\./, '')
}

interface SaberEntry {
  type: 'declarativo' | 'procedimental' | 'actitudinal'
  description: string
  gradeCodes: Set<string>
}

/** competencyCode (TIGA, con "CE.") -> saberCode -> entrada acumulada (grados que la usan) */
type CompetencySaberMap = Map<string, Map<string, SaberEntry>>

const KNOWLEDGE_FIELDS: { field: string; type: SaberEntry['type'] }[] = [
  { field: 'declarative_knowledge', type: 'declarativo' },
  { field: 'procedural_knowledge', type: 'procedimental' },
  { field: 'attitudinal_knowledge', type: 'actitudinal' },
]

/** Solo el formato 1 (datasets por grado) tiene huecos reales — el formato 2 (bachillerato) ya se auditó completo. */
function parseFormat1(data: Record<string, unknown>): CompetencySaberMap {
  const map: CompetencySaberMap = new Map()
  const datasets = (data.datasets as Record<string, unknown>[]) ?? []
  for (const dataset of datasets) {
    const gradeCodeRaw = (dataset.grade_code as string | undefined) ?? (dataset.grade as { code?: string } | undefined)?.code
    const gradeCode = mapGradeCode(gradeCodeRaw)
    if (!gradeCode) continue
    const competencies = (dataset.competencies as Record<string, unknown>[]) ?? []
    for (const competency of competencies) {
      const competencyCode = competency.code as string
      if (!map.has(competencyCode)) map.set(competencyCode, new Map())
      const saberMap = map.get(competencyCode)!
      for (const { field, type } of KNOWLEDGE_FIELDS) {
        const items = (competency[field] as Record<string, unknown>[]) ?? []
        for (const item of items) {
          const code = item.code as string | undefined
          const description = (item.text as string | undefined) ?? (item.description as string | undefined)
          if (!code || !description) continue
          if (!saberMap.has(code)) saberMap.set(code, { type, description, gradeCodes: new Set() })
          saberMap.get(code)!.gradeCodes.add(gradeCode)
        }
      }
    }
  }
  return map
}

const SUBJECTS = [
  'mathematics',
  'language_literature',
  'natural_sciences',
  'cultural_artistic_education',
  'social_studies',
]

async function main() {
  console.log('Importador de saberes faltantes (fuente: TIGA, formato 1 / EGB)')
  console.log(`TIGA_DATA_DIR = ${TIGA_DATA_DIR}\n`)

  const allCompetencies = await prisma.competency.findMany({
    where: { institutionId: null },
    include: { sabers: true },
  })

  let totalCreated = 0
  let totalSkippedNoCompetency = 0

  for (const subject of SUBJECTS) {
    const filePath = path.join(TIGA_DATA_DIR, subject, `${subject}_multigrade.json`)
    if (!fs.existsSync(filePath)) {
      console.log(`SKIP  ${subject}: archivo fuente no encontrado en ${filePath}\n`)
      continue
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
    const tigaMap = parseFormat1(data)

    let created = 0
    let noCompetencyMatch = 0

    for (const [tigaCompetencyCode, saberMap] of tigaMap) {
      const dbCompetency = allCompetencies.find(
        (c) => normalizeCompetencyCode(c.code) === normalizeCompetencyCode(tigaCompetencyCode),
      )
      if (!dbCompetency) {
        noCompetencyMatch++
        continue
      }
      const existingCodes = new Set(dbCompetency.sabers.map((s) => s.code))

      for (const [saberCode, entry] of saberMap) {
        if (existingCodes.has(saberCode)) continue // ya existe — no se toca (decisión explícita)
        await prisma.competencySaber.create({
          data: {
            competencyId: dbCompetency.id,
            type: entry.type,
            code: saberCode,
            description: entry.description,
            gradeCodes: [...entry.gradeCodes].sort(),
          },
        })
        created++
      }
    }

    console.log(`OK    ${subject}: ${created} saberes creados, ${noCompetencyMatch} competencias TIGA sin match en BD`)
    totalCreated += created
    totalSkippedNoCompetency += noCompetencyMatch
  }

  console.log(`\nTOTAL: ${totalCreated} saberes nuevos creados en el catálogo global, ${totalSkippedNoCompetency} competencias sin match`)
}

main()
  .catch((e) => {
    console.error('Error en importador:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
