import { apiGet, apiPost } from '@/shared/lib/api-client'

export interface CurriculumArea {
  id: string
  code: string
  name: string
}

export interface CurriculumSkill {
  id: string
  code: string
  description: string
  indicatorText: string | null
  competencyTags: string[]
  insercionTags: string[]
  profileRefs: string[]
  isCustom: boolean
}

export interface CurriculumCriterion {
  id: string
  code: string
  description: string
  skills: CurriculumSkill[]
}

export type SaberType = 'declarativo' | 'procedimental' | 'actitudinal'

export interface CurriculumSaber {
  id: string
  skillId: string
  type: SaberType
  code: string
  description: string
  isActive: boolean
}

export const curriculumApi = {
  listAreas: () => apiGet<CurriculumArea[]>('curriculum/areas'),

  listCriteria: (areaId: string, subnivel: string) =>
    apiGet<CurriculumCriterion[]>(`curriculum/areas/${areaId}/criteria`, { subnivel }),

  /** Destrezas disponibles para una materia (según su área curricular vinculada + subnivel del grado) */
  listSkillsForSubject: (subjectId: string, subnivel: string) =>
    apiGet<CurriculumSkill[]>(`curriculum/subjects/${subjectId}/skills`, { subnivel }),

  /** Saberes (declarativo/procedimental/actitudinal) de una destreza */
  listSaberesForSkill: (skillId: string) =>
    apiGet<CurriculumSaber[]>(`curriculum/skills/${skillId}/saberes`),

  createSaber: (data: { skillId: string; type: SaberType; code: string; description: string }) =>
    apiPost<CurriculumSaber>('curriculum/saberes', data),
}
