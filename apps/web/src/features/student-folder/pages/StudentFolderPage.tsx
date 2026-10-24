import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Download, FileText, ChevronRight } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { downloadBulletinPdf, getStudentBulletin } from '@/features/reports/api/reports.api'
import { useStudentFolder } from '../hooks/useStudentFolder'
import { DossierPanel } from '@/features/dossier/components/DossierPanel'
import {
  downloadEnrollmentCertificate,
  downloadActaByUrl,
  type FolderEnrollment,
} from '../api/student-folder.api'

type Tab = 'resumen' | 'matriculas' | 'calificaciones' | 'incidentes' | 'actas' | 'atenciones' | 'expediente'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'matriculas', label: 'Matrículas' },
  { id: 'calificaciones', label: 'Calificaciones' },
  { id: 'incidentes', label: 'Incidentes' },
  { id: 'actas', label: 'Actas' },
  { id: 'atenciones', label: 'Atenciones' },
  { id: 'expediente', label: 'Expediente de respaldo' },
]

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  withdrawn: 'Retirado',
  transferred: 'Trasladado',
}

const fmtDate = (d: string | null) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, day))
}

const personName = (p: { profile: { firstName: string; lastName: string } | null } | null) =>
  p?.profile ? `${p.profile.firstName} ${p.profile.lastName}` : '—'

export function StudentFolderPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('resumen')

  const { data: folder, isLoading, isError, error } = useStudentFolder(id)

  if (isLoading) return <PageLoader />
  if (isError || !folder) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/student-folder')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
        </Button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">No se pudo cargar la carpeta</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isError ? getErrorMessage(error) : 'No tienes acceso a este estudiante o no existe.'}
          </p>
        </div>
      </div>
    )
  }

  const current = folder.enrollments[0]

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2"
          onClick={() => navigate('/student-folder')}
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
        </Button>
        <h1 className="text-2xl font-bold">{folder.student.fullName}</h1>
        <p className="text-sm text-muted-foreground">{folder.student.email}</p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium',
              tab === t.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && <ResumenTab folder={folder} current={current} />}
      {tab === 'matriculas' && <MatriculasTab studentId={id} enrollments={folder.enrollments} />}
      {tab === 'calificaciones' && <CalificacionesTab studentId={id} enrollments={folder.enrollments} />}
      {tab === 'incidentes' && <IncidentesTab folder={folder} />}
      {tab === 'actas' && <ActasTab folder={folder} />}
      {tab === 'atenciones' && <AtencionesTab folder={folder} />}
      {tab === 'expediente' && <DossierPanel studentId={id} />}
    </div>
  )
}

// ─────────────────────────── Resumen ───────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">{children}</p>
    </div>
  )
}

function ResumenTab({
  folder,
  current,
}: {
  folder: NonNullable<ReturnType<typeof useStudentFolder>['data']>
  current?: FolderEnrollment
}) {
  const p = (folder.student.profile ?? {}) as Record<string, string | null>
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del estudiante</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">{folder.student.fullName}</Field>
        <Field label="Cédula">{p.dni ?? '—'}</Field>
        <Field label="Curso actual">
          {current
            ? `${current.parallel.level?.name ?? ''} ${current.parallel.name} — ${current.academicYear.name}`
            : 'Sin matrícula activa'}
        </Field>
        <Field label="Teléfono">{p.phone ?? '—'}</Field>
        <Field label="Correo">{folder.student.email}</Field>
        <Field label="Dirección">{p.address ?? '—'}</Field>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Matrículas ───────────────────────────

function MatriculasTab({
  studentId,
  enrollments,
}: {
  studentId: string
  enrollments: FolderEnrollment[]
}) {
  async function download(enrollmentId: string) {
    try {
      await downloadEnrollmentCertificate(studentId, enrollmentId)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  if (enrollments.length === 0) {
    return <EmptyState title="Sin matrículas" description="El estudiante no tiene matrículas registradas." />
  }

  return (
    <div className="space-y-2">
      {enrollments.map((e) => (
        <Card key={e.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{e.academicYear.name}</p>
              <p className="text-xs text-muted-foreground">
                {e.parallel.level?.name ?? ''} {e.parallel.name} · Matriculado el {fmtDate(e.enrolledAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={e.status === 'active' ? 'success' : 'secondary'}>
                {STATUS_LABELS[e.status] ?? e.status}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => download(e.id)}>
                <Download className="mr-1 h-4 w-4" />
                Certificado
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─────────────────────────── Calificaciones ───────────────────────────

function CalificacionesTab({
  studentId,
  enrollments,
}: {
  studentId: string
  enrollments: FolderEnrollment[]
}) {
  const [openYear, setOpenYear] = useState<string | null>(null)

  if (enrollments.length === 0) {
    return <EmptyState title="Sin calificaciones" description="El estudiante no tiene años matriculados." />
  }

  return (
    <div className="space-y-2">
      {enrollments.map((e) => (
        <YearGrades
          key={e.id}
          studentId={studentId}
          enrollment={e}
          open={openYear === e.id}
          onToggle={() => setOpenYear(openYear === e.id ? null : e.id)}
        />
      ))}
    </div>
  )
}

function YearGrades({
  studentId,
  enrollment,
  open,
  onToggle,
}: {
  studentId: string
  enrollment: FolderEnrollment
  open: boolean
  onToggle: () => void
}) {
  const bulletinQ = useQuery({
    queryKey: ['student-bulletin', enrollment.academicYear.id, enrollment.parallel.id, studentId],
    queryFn: () =>
      getStudentBulletin({
        yearId: enrollment.academicYear.id,
        parallelId: enrollment.parallel.id,
        studentId,
      }),
    enabled: open,
  })

  async function downloadCert() {
    try {
      await downloadBulletinPdf({
        yearId: enrollment.academicYear.id,
        parallelId: enrollment.parallel.id,
        studentId,
      })
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button onClick={onToggle} className="flex items-center gap-2 text-left">
            <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
            <div>
              <p className="text-sm font-medium">{enrollment.academicYear.name}</p>
              <p className="text-xs text-muted-foreground">
                {enrollment.parallel.level?.name ?? ''} {enrollment.parallel.name}
              </p>
            </div>
          </button>
          <Button variant="outline" size="sm" onClick={downloadCert}>
            <Download className="mr-1 h-4 w-4" />
            Certificado de notas
          </Button>
        </div>

        {open && (
          <div className="mt-4 border-t pt-4">
            {bulletinQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Cargando calificaciones...</p>
            ) : bulletinQ.isError ? (
              <p className="text-sm text-destructive">{getErrorMessage(bulletinQ.error)}</p>
            ) : (
              <div className="space-y-1.5">
                {(bulletinQ.data?.subjects ?? []).map((s) => (
                  <div key={s.subjectName} className="flex items-center justify-between text-sm">
                    <span>{s.subjectName}</span>
                    <span className="font-medium">
                      {s.finalAverage != null ? s.finalAverage.toFixed(2) : '—'}
                    </span>
                  </div>
                ))}
                <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm font-semibold">
                  <span>Promedio general</span>
                  <span>
                    {bulletinQ.data?.overallAverage != null
                      ? bulletinQ.data.overallAverage.toFixed(2)
                      : '—'}
                  </span>
                </div>
                {(bulletinQ.data?.subjects ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin calificaciones registradas en este año.</p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─────────────────────────── Incidentes ───────────────────────────

function IncidentesTab({
  folder,
}: {
  folder: NonNullable<ReturnType<typeof useStudentFolder>['data']>
}) {
  const navigate = useNavigate()
  if (folder.incidents.length === 0) {
    return <EmptyState title="Sin incidentes" description="El estudiante no tiene incidentes registrados." />
  }
  return (
    <div className="space-y-2">
      {folder.incidents.map((inc) => (
        <Card
          key={inc.id}
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => navigate(`/incidents/${inc.id}`)}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">{inc.incidentType?.name ?? inc.category}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(inc.incidentDate)} · reportó {personName(inc.reporter)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{inc.workflowState}</Badge>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─────────────────────────── Actas ───────────────────────────

function ActasTab({
  folder,
}: {
  folder: NonNullable<ReturnType<typeof useStudentFolder>['data']>
}) {
  async function download(downloadUrl: string, id: string) {
    try {
      await downloadActaByUrl(downloadUrl, `acta-${id}.pdf`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  if (folder.actas.length === 0) {
    return <EmptyState title="Sin actas" description="No hay actas de compromiso ni de atención." />
  }

  return (
    <div className="space-y-2">
      {folder.actas.map((a) => (
        <Card key={`${a.kind}-${a.id}`}>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(a.createdAt)} ·{' '}
                  {a.kind === 'incident_commitment' ? 'Incidente' : 'Atención a padres'}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => download(a.downloadUrl, a.id)}>
              <Download className="mr-1 h-4 w-4" />
              PDF
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ─────────────────────────── Atenciones ───────────────────────────

function AtencionesTab({
  folder,
}: {
  folder: NonNullable<ReturnType<typeof useStudentFolder>['data']>
}) {
  const navigate = useNavigate()
  if (folder.parentMeetings.length === 0) {
    return <EmptyState title="Sin atenciones" description="El estudiante no tiene atenciones registradas." />
  }
  return (
    <div className="space-y-2">
      {folder.parentMeetings.map((m) => (
        <Card
          key={m.id}
          className="cursor-pointer transition-colors hover:bg-accent"
          onClick={() => navigate(`/parent-meetings/${m.id}`)}
        >
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">{m.subject}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(m.meetingDate)}
                {m.meetingTime ? ` ${m.meetingTime}` : ''} · {m.visitorName}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {m.signedAt ? (
                <Badge variant="success">Firmada</Badge>
              ) : (
                <Badge variant="secondary">Pendiente</Badge>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
