import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Download, Trash2, PenLine } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { SignaturePad } from '../components/SignaturePad'
import {
  useParentMeeting,
  useSaveSignature,
  useDeleteParentMeeting,
} from '../hooks/useParentMeetings'
import { downloadActaPdf } from '../api/parent-meetings.api'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'

const personName = (p: { profile: { firstName: string; lastName: string } } | null | undefined) =>
  p?.profile ? `${p.profile.firstName} ${p.profile.lastName}` : '—'

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, day))
}

const fmtDateTime = (d: string | null) =>
  d ? new Date(d).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  )
}

export function ParentMeetingDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canWrite = hasPermission('parent_meetings:write')

  const { data: meeting, isLoading } = useParentMeeting(id)
  const saveSignature = useSaveSignature(id)
  const deleteMutation = useDeleteParentMeeting()

  const [signature, setSignature] = useState<string | null>(null)

  if (isLoading || !meeting) return <PageLoader />

  async function handleDelete() {
    if (!(await confirmDialog({
      title: 'Eliminar atención',
      description: '¿Eliminar esta atención? Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      destructive: true,
    }))) return
    deleteMutation.mutate(id, { onSuccess: () => navigate('/parent-meetings') })
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/parent-meetings')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Atención a padres</h1>
            <p className="text-sm text-muted-foreground">
              {fmtDate(meeting.meetingDate)}
              {meeting.meetingTime ? ` — ${meeting.meetingTime}` : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadActaPdf(id)}>
            <Download className="mr-1 h-4 w-4" />
            Generar acta (PDF)
          </Button>
          {canWrite && (
            <Button variant="ghost" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la atención</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Persona que se acercó">
            {meeting.visitorName}
            {meeting.visitorRelation ? ` (${meeting.visitorRelation})` : ''}
          </Field>
          <Field label="Estudiante">
            {meeting.student ? personName(meeting.student) : 'General (sin estudiante)'}
          </Field>
          <Field label="Asunto">{meeting.subject}</Field>
          <Field label="Atendió">{personName(meeting.recorder)}</Field>
          <div className="sm:col-span-2">
            <Field label="Detalle de lo hablado">
              <span className="whitespace-pre-wrap">{meeting.details}</span>
            </Field>
          </div>
          {meeting.agreements && (
            <div className="sm:col-span-2">
              <Field label="Acuerdos / compromisos">
                <span className="whitespace-pre-wrap">{meeting.agreements}</span>
              </Field>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5" />
            Firma del representante
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {meeting.signedAt ? (
            <p className="text-sm text-muted-foreground">
              Firmada el {fmtDateTime(meeting.signedAt)}. Puedes volver a firmar para reemplazarla.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no hay firma registrada.
            </p>
          )}

          {canWrite && (
            <>
              <SignaturePad onChange={setSignature} />
              <div className="flex justify-end">
                <Button
                  onClick={() => signature && saveSignature.mutate(signature)}
                  disabled={!signature || saveSignature.isPending}
                >
                  {saveSignature.isPending ? 'Guardando...' : 'Guardar firma'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
