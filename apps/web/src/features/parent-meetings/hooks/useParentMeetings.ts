import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  listParentMeetings,
  getParentMeeting,
  createParentMeeting,
  updateParentMeeting,
  deleteParentMeeting,
  saveParentMeetingSignature,
  getMeetingStudents,
  type CreateParentMeetingInput,
} from '../api/parent-meetings.api'

export function useParentMeetings(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['parent-meetings', params ?? {}],
    queryFn: () => listParentMeetings(params),
  })
}

export function useParentMeeting(id: string) {
  return useQuery({
    queryKey: ['parent-meeting', id],
    queryFn: () => getParentMeeting(id),
    enabled: !!id,
  })
}

export function useMeetingStudents() {
  return useQuery({
    queryKey: ['parent-meetings', 'students'],
    queryFn: getMeetingStudents,
  })
}

export function useCreateParentMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateParentMeetingInput) => createParentMeeting(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dossier'] })
      qc.invalidateQueries({ queryKey: ['parent-meetings'] })
      toast.success('Atención registrada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateParentMeeting(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<CreateParentMeetingInput>) => updateParentMeeting(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dossier'] })
      qc.invalidateQueries({ queryKey: ['parent-meetings'] })
      qc.invalidateQueries({ queryKey: ['parent-meeting', id] })
      toast.success('Atención actualizada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDeleteParentMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteParentMeeting(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dossier'] })
      qc.invalidateQueries({ queryKey: ['parent-meetings'] })
      toast.success('Atención eliminada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSaveSignature(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (signature: string) => saveParentMeetingSignature(id, signature),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dossier'] })
      qc.invalidateQueries({ queryKey: ['parent-meeting', id] })
      toast.success('Firma guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
