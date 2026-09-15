import { prisma } from '../../../../shared/infrastructure/database/prisma'

export class PrismaCurricularInsertionRepository {
  listBanks() {
    return prisma.curricularInsertionBank.findMany({ orderBy: { title: 'asc' } })
  }

  /**
   * Candidatos de inserción curricular cuyo sourceCode coincide (por prefijo) con
   * alguno de los códigos de destreza/competencia dados — es una sugerencia de
   * referencia para el docente al redactar, nunca bloquea ni se auto-aplica.
   */
  async findCandidatesForCodes(codes: string[], bankKey?: string) {
    if (codes.length === 0) return []
    // El sourceCode del documento fuente puede venir con o sin el prefijo "CE." de
    // competencia, y puede ser 1 nivel más corto (destreza/competencia sin sufijo de
    // indicador) que el código dado — coincidencia EXACTA únicamente (bare, CE.bare,
    // y su ancestro exacto un nivel arriba); un comodín de prefijo captura demasiados
    // hermanos del mismo criterio y vuelve la sugerencia irrelevante.
    const variants = new Set<string>()
    for (const code of codes) {
      const bare = code.replace(/^CE\./, '')
      const segments = bare.split('.')
      variants.add(bare)
      variants.add(`CE.${bare}`)
      if (segments.length > 3) {
        const oneLevelUp = segments.slice(0, segments.length - 1).join('.')
        variants.add(oneLevelUp)
        variants.add(`CE.${oneLevelUp}`)
      }
    }

    const candidates = await prisma.curricularInsertionCandidate.findMany({
      where: {
        ...(bankKey ? { bank: { key: bankKey } } : {}),
        sourceCode: { in: [...variants] },
      },
      include: { bank: { select: { key: true, title: true } } },
      take: 30,
    })
    return candidates
  }
}
