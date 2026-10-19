import type { ActaInput } from '../services/commitment-document'
export interface CreateIncidentDto {
  studentId: string
  incidentDate: string // YYYY-MM-DD
  incidentTypeId?: string
  category: string
  description: string
  severity?: string
}

export interface UpdateIncidentDto {
  incidentTypeId?: string
  category?: string
  description?: string
  severity?: string
  status?: string
  resolutionNotes?: string
}

export interface ListIncidentsQuery {
  studentId?: string
  status?: string
  severity?: string
  workflowState?: string
  search?: string
}

// ---- Debido proceso ----

export const WORKFLOW_STATES = [
  'reportado',
  'en_revision',
  'derivado_dece',
  'medidas_definidas',
  'acta_firmada',
  'en_seguimiento',
  'resuelto',
  'cerrado',
] as const

export type WorkflowState = (typeof WORKFLOW_STATES)[number]

export interface ChangeStateDto {
  workflowState: WorkflowState
  note?: string
}

export interface AssignDeceDto {
  deceId: string
  note?: string
}

export interface AddEventDto {
  description: string
}

export interface CreateCommitmentDto {
  document?: ActaInput
  terms: string
  followUpDate?: string
  signatories?: Record<string, unknown>
}

// ---- Tipos de falta (catálogo) ----

export interface CreateIncidentTypeDto {
  name: string
  severity?: 'leve' | 'grave' | 'muy_grave'
  description?: string
  requiresDece?: boolean
  requiresCommitment?: boolean
}

export interface UpdateIncidentTypeDto {
  name?: string
  severity?: 'leve' | 'grave' | 'muy_grave'
  description?: string
  requiresDece?: boolean
  requiresCommitment?: boolean
}
