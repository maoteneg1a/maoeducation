export interface CreateCustomSkillDto {
  criterionId: string
  code: string
  description: string
  indicatorText?: string
  competencyTags?: string[]
  insercionTags?: string[]
}

export interface UpdateSkillDto {
  description?: string
  indicatorText?: string
  competencyTags?: string[]
  insercionTags?: string[]
  isActive?: boolean
}

export type SaberType = 'declarativo' | 'procedimental' | 'actitudinal'

export interface CreateSaberDto {
  skillId: string
  type: SaberType
  code: string
  description: string
}

export interface UpdateSaberDto {
  description?: string
  isActive?: boolean
}
