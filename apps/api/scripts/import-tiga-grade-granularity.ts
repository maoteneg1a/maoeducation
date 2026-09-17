/**
 * Importa la granularidad por grado individual (fuente: TIGA,
 * `sistema_portafolio_docente/data/cnc_multigrade/<materia>/*.json`) hacia
 * `CompetencySaber.gradeCodes`.
 *
 * Contexto del bug que esto arregla: el modelo de Auleka agrupa TODO un
 * subnivel (ej. "media" = 5°,6°,7° de Básica) bajo una sola `Competency` con
 * todos sus `CompetencySaber` — sin distinguir que, en el currículo real
 * (TIGA), una misma competencia compartida entre grados puede tener un
 * subconjunto DISTINTO de saberes por grado (ej. CE.CN.3.1: 5EGB usa los 7
 * declarativos completos, 6EGB solo 2, 7EGB usa 6 distintos). El wizard de
 * distribución semanal (ver `competency-week-distribution.ts` /
 * `prisma-planning.repository.ts`) por eso siempre ofrecía el conjunto
 * completo sin importar si el docente daba clase en 5°, 6° o 7°.
 *
 * `gradeCodes` es retrocompatible por diseño: array vacío (default de
 * columna) = "aplica a todos los grados del subnivel de la competencia"
 * (comportamiento histórico). Solo cuando este importador llena el array con
 * códigos reales de `Level.code` (ej. "5B","6B") se activa el filtro por
 * grado para esos saberes específicos — ver el filtro en
 * `availableCompetenciesForDistribution`.
 *
 * Idempotente: el array final se SOBREESCRIBE (no se acumula), así que
 * correrlo N veces da siempre el mismo resultado. Solo escribe en BD cuando
 * el valor calculado difiere del actual.
 *
 * No inventa ni crea `Competency`/`CompetencySaber` nuevos — solo etiqueta
 * los que YA EXISTEN en la BD de cada institución. Si un saber de TIGA no
 * tiene equivalente exacto en la BD (el banco sembrado por
 * `institution-bootstrap`/`retrofit-competencies` puede traer un subconjunto
 * distinto de la fuente), se reporta como "sin match" pero no se toca nada.
 *
 * Uso:
 *   cd apps/api
 *   DATABASE_URL="postgresql://maoedu:maoedu_dev@localhost:5433/maoeducation" \
 *     npx tsx scripts/import-tiga-grade-granularity.ts
 *
 * La ruta de los JSON fuente es configurable vía TIGA_DATA_DIR (por defecto,
 * la ruta local usada durante el desarrollo de esta migración). Si la carpeta
 * no existe (ej. en CI/producción, donde el repo de referencia TIGA no está
 * presente), el importador se salta con un aviso — no es un script que deba
 * correr en el pipeline normal, es una migración de datos puntual.
 */
import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()

const TIGA_DATA_DIR = process.env.TIGA_DATA_DIR ?? '/Users/mtene/Downloads/sistema_portafolio_docente/data/cnc_multigrade'

/** Códigos TIGA de grado ("2EGB".."10EGB", "1BGU".."3BGU") -> Level.code de Auleka ("2B".."10B", "1BGU".."3BGU"). No hay entrada para "1EGB" (preparatoria) — TIGA no lo incluye en estos datasets multigrado, ninguna asignación real matcheará ese código, lo cual es correcto. */
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

/** competencyCode (TIGA, con prefijo "CE.") -> saberCode -> Set<gradeCode Auleka> */
type SaberGradeMap = Map<string, Map<string, Set<string>>>

function addSaber(map: SaberGradeMap, competencyCode: string, saberCode: string, gradeCode: string | null) {
  if (!gradeCode) return
  if (!map.has(competencyCode)) map.set(competencyCode, new Map())
  const saberMap = map.get(competencyCode)!
  if (!saberMap.has(saberCode)) saberMap.set(saberCode, new Set())
  saberMap.get(saberCode)!.add(gradeCode)
}

function collectKnowledgeCodes(obj: Record<string, unknown>, keys: string[]): string[] {
  const codes: string[] = []
  for (const key of keys) {
    const arr = obj[key]
    if (Array.isArray(arr)) {
      for (const item of arr) {
        const code = (item as { code?: unknown })?.code
        if (typeof code === 'string') codes.push(code)
      }
    }
  }
  return codes
}

/** Formato 1: { datasets: [{ grade_code? | grade?: {code}, competencies: [{code, declarative_knowledge, procedural_knowledge, attitudinal_knowledge}] }] } — mathematics, language_literature, natural_sciences, cultural_artistic_education, social_studies. */
function parseFormat1(data: Record<string, unknown>): SaberGradeMap {
  const map: SaberGradeMap = new Map()
  const datasets = (data.datasets as Record<string, unknown>[]) ?? []
  for (const dataset of datasets) {
    const gradeCodeRaw = (dataset.grade_code as string | undefined) ?? (dataset.grade as { code?: string } | undefined)?.code
    const gradeCode = mapGradeCode(gradeCodeRaw)
    const competencies = (dataset.competencies as Record<string, unknown>[]) ?? []
    for (const competency of competencies) {
      const competencyCode = competency.code as string
      const saberCodes = collectKnowledgeCodes(competency, ['declarative_knowledge', 'procedural_knowledge', 'attitudinal_knowledge'])
      for (const saberCode of saberCodes) addSaber(map, competencyCode, saberCode, gradeCode)
    }
  }
  return map
}

/** Formato 2: { grades: { [gradeCode]: { competencies: [{code, knowledge: {declarative, procedural, attitudinal}}] } } } — chemistry, history, citizenship_education, philosophy, english, entrepreneurship_management, physics. */
function parseFormat2(data: Record<string, unknown>): SaberGradeMap {
  const map: SaberGradeMap = new Map()
  const grades = (data.grades as Record<string, Record<string, unknown>>) ?? {}
  for (const [tigaGradeCode, gradeData] of Object.entries(grades)) {
    const gradeCode = mapGradeCode(tigaGradeCode)
    const competencies = (gradeData.competencies as Record<string, unknown>[]) ?? []
    for (const competency of competencies) {
      const competencyCode = competency.code as string
      const knowledge = (competency.knowledge as Record<string, unknown>) ?? {}
      const saberCodes = collectKnowledgeCodes(knowledge, ['declarative', 'procedural', 'attitudinal'])
      for (const saberCode of saberCodes) addSaber(map, competencyCode, saberCode, gradeCode)
    }
  }
  return map
}

interface SubjectSource {
  folder: string
  file: string
  format: 1 | 2 | 'unusable'
  reason?: string
}

const SUBJECTS: SubjectSource[] = [
  { folder: 'mathematics', file: 'mathematics_multigrade.json', format: 1 },
  { folder: 'language_literature', file: 'language_literature_multigrade.json', format: 1 },
  { folder: 'natural_sciences', file: 'natural_sciences_multigrade.json', format: 1 },
  { folder: 'cultural_artistic_education', file: 'cultural_artistic_education_multigrade.json', format: 1 },
  { folder: 'social_studies', file: 'social_studies_multigrade.json', format: 1 },
  { folder: 'chemistry', file: 'chemistry_multigrade.json', format: 2 },
  { folder: 'history', file: 'history_multigrade.json', format: 2 },
  { folder: 'citizenship_education', file: 'citizenship_education_multigrade.json', format: 2 },
  { folder: 'philosophy', file: 'philosophy_multigrade.json', format: 2 },
  { folder: 'english', file: 'english_multigrade.json', format: 2 },
  { folder: 'entrepreneurship_management', file: 'entrepreneurship_management_multigrade.json', format: 2 },
  { folder: 'physics', file: 'physics_multigrade.json', format: 2 },
  {
    folder: 'biology',
    file: 'biology_multigrade.json',
    format: 'unusable',
    reason:
      'grade_curricula: official_distribution_available=false y curriculum=null para los 3 grados de BGU (1BGU,2BGU,3BGU) — no hay Excel fuente para Biología, solo un PDF de Bachillerato General. El canonical_curriculum alternativo no distingue grado (reconciliation_identity=["sublevel","competency_code"], sin "grade_code") — TIGA no tiene distribución oficial por grado individual para esta materia, se documenta y se deja sin cambios.',
  },
  {
    folder: 'physical_education',
    file: 'physical_education_sublevel_curriculum.json',
    format: 'unusable',
    reason:
      'source_distribution_model=SUBLEVEL_NOT_GRADE y planning_policy.official_source_unit=SUBLEVEL — TIGA distribuye Educación Física por SUBNIVEL completo (ELEMENTAL/MEDIA/SUPERIOR/BACHILLERATO), no por grado individual. No hay currículo oficial por grado para mapear, se documenta y se deja sin cambios.',
  },
]

interface SubjectReport {
  subject: string
  status: 'imported' | 'skipped'
  reason?: string
  labeled: number
  noMatch: number
  noMatchSamples: string[]
}

async function main() {
  console.log('Importador de granularidad por grado (fuente: TIGA)')
  console.log(`TIGA_DATA_DIR = ${TIGA_DATA_DIR}\n`)

  const institutions = await prisma.institution.findMany({ select: { id: true, name: true } })
  console.log(`Instituciones encontradas: ${institutions.length} (${institutions.map((i) => i.name).join(', ')})\n`)

  const reports: SubjectReport[] = []

  for (const subject of SUBJECTS) {
    if (subject.format === 'unusable') {
      console.log(`SKIP  ${subject.folder}: ${subject.reason}\n`)
      reports.push({ subject: subject.folder, status: 'skipped', reason: subject.reason, labeled: 0, noMatch: 0, noMatchSamples: [] })
      continue
    }

    const filePath = path.join(TIGA_DATA_DIR, subject.folder, subject.file)
    if (!fs.existsSync(filePath)) {
      const reason = `archivo fuente no encontrado en ${filePath}`
      console.log(`SKIP  ${subject.folder}: ${reason}\n`)
      reports.push({ subject: subject.folder, status: 'skipped', reason, labeled: 0, noMatch: 0, noMatchSamples: [] })
      continue
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
    const gradeMap = subject.format === 1 ? parseFormat1(data) : parseFormat2(data)

    let labeled = 0
    let noMatch = 0
    let written = 0
    const noMatchSamples: string[] = []

    for (const inst of institutions) {
      const competencies = await prisma.competency.findMany({
        where: { area: { institutionId: inst.id } },
        include: { sabers: true },
      })

      for (const [tigaCompetencyCode, saberMap] of gradeMap) {
        const owning = competencies.find((c) => normalizeCompetencyCode(c.code) === normalizeCompetencyCode(tigaCompetencyCode))
        if (!owning) continue

        for (const [saberCode, grades] of saberMap) {
          const saber = owning.sabers.find((s) => s.code === saberCode)
          if (!saber) {
            noMatch++
            if (noMatchSamples.length < 15) noMatchSamples.push(`${inst.name}: ${tigaCompetencyCode} / ${saberCode}`)
            continue
          }
          const gradeCodes = [...grades].sort()
          const current = [...saber.gradeCodes].sort()
          if (JSON.stringify(current) !== JSON.stringify(gradeCodes)) {
            await prisma.competencySaber.update({ where: { id: saber.id }, data: { gradeCodes } })
            written++
          }
          labeled++
        }
      }
    }

    console.log(`OK    ${subject.folder}: ${labeled} saberes etiquetados (${written} escrituras nuevas/cambiadas), ${noMatch} sin match`)
    reports.push({ subject: subject.folder, status: 'imported', labeled, noMatch, noMatchSamples })
  }

  console.log('\n=== RESUMEN ===')
  let totalLabeled = 0
  let totalNoMatch = 0
  for (const r of reports) {
    if (r.status === 'skipped') {
      console.log(`- ${r.subject}: SIN GRANULARIDAD UTILIZABLE / OMITIDO — ${r.reason}`)
    } else {
      console.log(`- ${r.subject}: ${r.labeled} etiquetados, ${r.noMatch} sin match`)
      totalLabeled += r.labeled
      totalNoMatch += r.noMatch
    }
  }
  console.log(`\nTOTAL: ${totalLabeled} saberes etiquetados en toda la plataforma, ${totalNoMatch} sin match`)

  for (const r of reports) {
    if (r.noMatchSamples.length) {
      console.log(`\nMuestra de "sin match" en ${r.subject} (hasta 15):`)
      for (const s of r.noMatchSamples) console.log(`  - ${s}`)
    }
  }
}

main()
  .catch((e) => {
    console.error('Error en importador:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
