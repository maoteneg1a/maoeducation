import { apiClient, apiGet, apiPut } from '@/shared/lib/api-client'

export interface ActaTemplate {
  title: string
  subtitle: string
  introduction: string
  closing: string
  accentColor: string
  includeTimeline: boolean
  includeEvidenceList: boolean
  showWatermark: boolean
  signatureLabels: string[]
}
export const actaTemplateApi = {
  get: () => apiGet<ActaTemplate>('institution/document-templates/incident-commitment'),
  save: (value: ActaTemplate) => apiPut<ActaTemplate>('institution/document-templates/incident-commitment', value),
  preview: async (value: ActaTemplate) => {
    const blob = await apiClient.post('institution/document-templates/incident-commitment/preview', { json: value }).blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url; anchor.download = 'vista-previa-acta.pdf'; anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}
