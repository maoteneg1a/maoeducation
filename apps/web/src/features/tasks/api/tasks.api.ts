import { apiGet, apiPost, apiPut, apiDelete, apiClient } from '@/shared/lib/api-client'

export interface TaskAttachment {
  id: string
  fileName: string
  storedName: string
  mimeType: string
  fileSize: number
  createdAt: string
  uploader: { id: string; profile: { firstName: string; lastName: string } }
}

export interface TaskAssignment {
  id: string
  subject: { id: string; name: string }
  parallel: { id: string; name: string; level: { name: string } }
  academicYear: { id: string; name: string }
  teacher: { id: string; profile: { firstName: string; lastName: string } }
}

export interface Task {
  id: string
  courseAssignmentId: string
  title: string
  description: string | null
  dueDate: string
  publishAt: string
  isPublished: boolean
  createdAt: string
  courseAssignment: TaskAssignment
  creator: { id: string; profile: { firstName: string; lastName: string } }
  activity: { id: string; isPublished: boolean; academicPeriodId?: string } | null
  attachments: TaskAttachment[]
}

export interface CreateTaskPayload {
  courseAssignmentId: string
  title: string
  description?: string
  dueDate: string
  publishAt?: string
}

export interface UpdateTaskPayload {
  title?: string
  description?: string
  dueDate?: string
  publishAt?: string
}

export const tasksApi = {
  list: (params?: { courseAssignmentId?: string; academicYearId?: string; from?: string; to?: string }) =>
    apiGet<Task[]>('tasks', params as Record<string, string>),
  getById: (id: string) => apiGet<Task>(`tasks/${id}`),
  create: (data: CreateTaskPayload) => apiPost<Task>('tasks', data),
  update: (id: string, data: UpdateTaskPayload) => apiPut<Task>(`tasks/${id}`, data),
  publish: (id: string) => apiPost<Task>(`tasks/${id}/publish`, {}),
  delete: (id: string) => apiDelete(`tasks/${id}`),

  uploadAttachment: (taskId: string, file: File): Promise<TaskAttachment> => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post(`tasks/${taskId}/attachments`, { body: form }).json<TaskAttachment>()
  },
  deleteAttachment: (taskId: string, attachmentId: string) =>
    apiDelete(`tasks/${taskId}/attachments/${attachmentId}`),
}


/** Ruta autenticada del adjunto (se descarga con openProtectedFile). */
export function getAttachmentUrl(storedName: string) {
  return `files/tasks/${storedName}`
}
