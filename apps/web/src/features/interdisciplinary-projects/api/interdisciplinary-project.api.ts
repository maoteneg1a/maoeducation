import { apiClient, apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/api-client'

export type InterdisciplinaryProjectStatus = 'borrador' | 'enviado' | 'aprobado'

export interface WeekEntry {
  id: string
  contributionId: string
  weekNumber: number
  weekProposito: string | null
  faseInicio: string | null
  faseDesarrollo: string | null
  faseCierre: string | null
  propositoPedagogico: string | null
  evidencias: string | null
}

export interface Contribution {
  id: string
  projectId: string
  courseAssignmentId: string
  contribucion: string | null
  responsabilidad: string | null
  skillIds: string[]
  saberIds: string[]
  courseAssignment?: {
    id: string
    subject: { id: string; name: string; curriculumAreaId: string | null }
    teacher: { id: string; profile: { firstName: string; lastName: string } }
  }
  weekEntries?: WeekEntry[]
}

export interface InterdisciplinaryProject {
  id: string
  parallelId: string
  academicPeriodId: string
  title: string
  situacionReto: string | null
  contexto: string | null
  propositoComun: string | null
  productoFinal: string | null
  weeksCount: number
  status: InterdisciplinaryProjectStatus
  createdAt: string
  parallel?: { id: string; name: string; level: { id: string; name: string; subnivel: string | null } }
  contributions?: Contribution[]
  _count?: { contributions: number }
}

export const interdisciplinaryProjectApi = {
  listProjects: (params: { parallelId: string; academicPeriodId: string }) =>
    apiGet<InterdisciplinaryProject[]>('interdisciplinary-projects', params),

  getProject: (id: string) => apiGet<InterdisciplinaryProject>(`interdisciplinary-projects/${id}`),

  createProject: (data: {
    parallelId: string
    academicPeriodId: string
    title: string
    situacionReto?: string
    contexto?: string
    propositoComun?: string
    productoFinal?: string
    weeksCount: number
  }) => apiPost<InterdisciplinaryProject>('interdisciplinary-projects', data),

  updateProject: (
    id: string,
    data: Partial<{
      title: string
      situacionReto: string
      contexto: string
      propositoComun: string
      productoFinal: string
      weeksCount: number
      status: InterdisciplinaryProjectStatus
    }>,
  ) => apiPut<InterdisciplinaryProject>(`interdisciplinary-projects/${id}`, data),

  joinProject: (projectId: string, courseAssignmentId: string) =>
    apiPost<Contribution>(`interdisciplinary-projects/${projectId}/contributions`, { courseAssignmentId }),

  updateContribution: (
    contributionId: string,
    data: Partial<{ contribucion: string; responsabilidad: string; skillIds: string[]; saberIds: string[] }>,
  ) => apiPut<Contribution>(`interdisciplinary-projects/contributions/${contributionId}`, data),

  removeContribution: (contributionId: string) =>
    apiDelete(`interdisciplinary-projects/contributions/${contributionId}`),

  upsertWeekEntry: (
    contributionId: string,
    data: {
      weekNumber: number
      weekProposito?: string
      faseInicio?: string
      faseDesarrollo?: string
      faseCierre?: string
      propositoPedagogico?: string
      evidencias?: string
    },
  ) => apiPut<WeekEntry>(`interdisciplinary-projects/contributions/${contributionId}/weeks`, data),

  async openProjectPdf(id: string) {
    const blob = await apiClient.get(`interdisciplinary-projects/${id}/pdf`).blob()
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
}
