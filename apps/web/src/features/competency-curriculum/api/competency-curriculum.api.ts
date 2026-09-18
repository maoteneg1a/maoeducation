import { apiGet, apiPost } from '@/shared/lib/api-client'

export interface CompetencyArea {
  id: string
  code: string
  name: string
}

export interface CompetencyIndicator {
  id: string
  code: string
  text: string
}

export interface Competency {
  id: string
  code: string
  text: string
  keyCompetencyCodes: string[]
  indicators?: CompetencyIndicator[]
}

export type CompetencySaberType = 'declarativo' | 'procedimental' | 'actitudinal'

export interface CompetencySaber {
  id: string
  competencyId: string
  type: CompetencySaberType
  code: string
  description: string
  isActive: boolean
}

export interface KeyCompetency {
  id: string
  code: string
  name: string
  shortName: string
  description: string
  color: string | null
}

export const competencyCurriculumApi = {
  listAreas: () => apiGet<CompetencyArea[]>('competency-curriculum/areas'),

  listCompetencies: (areaId: string, subnivel: string) =>
    apiGet<Competency[]>(`competency-curriculum/areas/${areaId}/competencies`, { subnivel }),

  /** Competencias disponibles para una materia (según su área curricular vinculada + subnivel del grado) */
  listCompetenciesForSubject: (subjectId: string, subnivel: string) =>
    apiGet<Competency[]>(`competency-curriculum/subjects/${subjectId}/competencies`, { subnivel }),

  /** `gradeCode` opcional filtra por granularidad TIGA (saberes distintos por grado dentro de un subnivel compartido). */
  listSaberesForCompetency: (competencyId: string, gradeCode?: string) =>
    apiGet<CompetencySaber[]>(`competency-curriculum/competencies/${competencyId}/saberes`, { gradeCode }),

  listKeyCompetencies: () => apiGet<KeyCompetency[]>('competency-curriculum/key-competencies'),

  createSaber: (data: { competencyId: string; type: CompetencySaberType; code: string; description: string }) =>
    apiPost<CompetencySaber>('competency-curriculum/saberes', data),
}
