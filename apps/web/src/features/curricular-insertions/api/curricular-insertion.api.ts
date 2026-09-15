import { apiGet } from '@/shared/lib/api-client'

export interface CurricularInsertionBank {
  id: string
  key: string
  title: string
}

export interface CurricularInsertionCandidate {
  id: string
  sourceCode: string
  text: string
  page: number | null
  bank: { key: string; title: string }
}

export const curricularInsertionApi = {
  listBanks: () => apiGet<CurricularInsertionBank[]>('curricular-insertions/banks'),

  /** Sugerencias de ejes de inserción curricular relevantes a los códigos dados — solo referencia. */
  findCandidatesForCodes: (codes: string[]) =>
    apiGet<CurricularInsertionCandidate[]>('curricular-insertions/candidates', { codes: codes.join(',') }),
}
