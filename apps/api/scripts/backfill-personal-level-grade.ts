/**
 * Diagnóstico + backfill para instituciones de "Profesor Personal" creadas
 * ANTES del fix del wizard (ver personal.routes.ts) que capturaba solo el
 * subnivel genérico y creaba un único `Level.code = 'PERSONAL'` para
 * cualquier grado — bug real: el filtro de `CompetencySaber.gradeCodes`
 * (saberes distintos por grado dentro de un mismo subnivel compartido) nunca
 * coincide con "PERSONAL", dejando a esos docentes sin ninguna sugerencia de
 * planificación ("Ninguna de las competencias disponibles tiene saberes
 * declarativos cargados").
 *
 * IMPORTANTE: `bootstrapInstitution` (institution-bootstrap.ts, corre en
 * /personal/register ANTES del wizard) ya crea los 13 Levels reales
 * (DEFAULT_LEVELS: 1B-10B, 1BGU-3BGU) para TODA institución, personal o no.
 * Eso significa que renombrar in-place "PERSONAL" -> "6B" chocaría con el
 * `@@unique([institutionId, code])` contra el "6B" real que YA existe. Este
 * script en cambio MIGRA los Parallel del Level "PERSONAL" hacia el Level
 * real correspondiente (find-or-create, igual que hace personal.routes.ts) y
 * borra el Level "PERSONAL" huérfano al final — nunca lo renombra en sitio.
 *
 * Este script NUNCA adivina el grado real — el nombre del Parallel no es
 * confiable ("sexto", "SEXTO B", "6to A" son parseables a mano pero un
 * heurístico automático puede asignarle el grado equivocado a una
 * institución real. En cambio:
 *
 *   1. Modo diagnóstico (default): lista todas las instituciones afectadas
 *      con su institutionId, nombre, nombre(s) de Parallel y subnivel actual
 *      — para que un humano decida el gradeCode real de cada una.
 *   2. Modo aplicar (--map): recibe un mapa explícito institutionId->gradeCode
 *      y SOLO migra las instituciones listadas ahí (nunca las que falten).
 *
 * Uso:
 *   DATABASE_URL=... npx tsx scripts/backfill-personal-level-grade.ts                     (diagnóstico)
 *   DATABASE_URL=... npx tsx scripts/backfill-personal-level-grade.ts --map='{"<institutionId>":"6B"}'   (migra solo esos IDs)
 */
import { PrismaClient } from '@prisma/client'
import { findGradeByCode } from '../src/shared/domain/grade-catalog'

const prisma = new PrismaClient()

async function main() {
  const mapArg = process.argv.find((a) => a.startsWith('--map='))
  const map: Record<string, string> = mapArg ? JSON.parse(mapArg.slice('--map='.length)) : {}
  const applying = Object.keys(map).length > 0

  for (const [institutionId, gradeCode] of Object.entries(map)) {
    if (!findGradeByCode(gradeCode)) {
      console.error(`ERROR: "${gradeCode}" (institución ${institutionId}) no es un gradeCode reconocido en GRADE_CATALOG.`)
      process.exit(1)
    }
  }

  const affectedLevels = await prisma.level.findMany({
    where: { code: 'PERSONAL' },
    include: {
      institution: { select: { id: true, name: true, code: true } },
      parallels: { select: { id: true, name: true } },
    },
  })

  if (affectedLevels.length === 0) {
    console.log('Ninguna institución tiene Level.code = "PERSONAL" — nada que diagnosticar ni aplicar.')
    await prisma.$disconnect()
    return
  }

  console.log(`Instituciones con Level.code = "PERSONAL" (${affectedLevels.length}):\n`)
  for (const level of affectedLevels) {
    const inst = level.institution
    const parallelNames = level.parallels.map((p) => p.name).join(', ') || '(sin paralelos)'
    const mappedGrade = map[inst.id]

    if (!applying) {
      console.log(`  ${inst.id}  ${inst.name} (${inst.code})`)
      console.log(`    subnivel actual: ${level.subnivel ?? '(ninguno)'} — paralelos: ${parallelNames}`)
      continue
    }

    if (!mappedGrade) {
      console.log(`  [SIN CAMBIOS] ${inst.id}  ${inst.name} — no está en --map, se deja igual (paralelos: ${parallelNames})`)
      continue
    }

    const grade = findGradeByCode(mappedGrade)!

    // find-or-create el Level real — para EGB/BGU normalmente YA existe desde
    // bootstrapInstitution; para "INICIAL" (no está en DEFAULT_LEVELS) se crea aquí.
    let targetLevel = await prisma.level.findFirst({ where: { institutionId: inst.id, code: grade.code } })
    if (!targetLevel) {
      targetLevel = await prisma.level.create({
        data: { institutionId: inst.id, code: grade.code, name: grade.name, sortOrder: grade.sortOrder, subnivel: grade.subnivel },
      })
    } else if (targetLevel.subnivel !== grade.subnivel) {
      targetLevel = await prisma.level.update({ where: { id: targetLevel.id }, data: { subnivel: grade.subnivel } })
    }

    if (level.parallels.length > 0) {
      await prisma.parallel.updateMany({
        where: { id: { in: level.parallels.map((p) => p.id) } },
        data: { levelId: targetLevel.id },
      })
    }
    await prisma.level.delete({ where: { id: level.id } })

    console.log(
      `  [MIGRADO] ${inst.id}  ${inst.name} — ${level.parallels.length} paralelo(s) movidos de "PERSONAL" a "${grade.code}" (${grade.name}); Level "PERSONAL" borrado`,
    )
  }

  if (!applying) {
    console.log(
      '\n(modo diagnóstico — nada se modificó; decide el gradeCode real de cada institución y vuelve a correr con --map=\'{"<institutionId>":"<gradeCode>"}\')',
    )
  }
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('ERROR:', e.message)
  process.exit(1)
})
