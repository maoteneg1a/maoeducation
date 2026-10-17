import * as React from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BarChart2, ClipboardList, Download, FileText, Printer, ScrollText, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { apiGet } from '@/shared/lib/api-client'
import { getErrorMessage } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import {
  getAttendanceReport,
  getBulletinBranding,
  getBulletinOptions,
  getEnrollmentReport,
  getGradesReport,
  getStudentBulletin,
  saveGlobalBulletinBranding,
  saveOwnBulletinBranding,
  uploadBulletinLogo,
  downloadBulletinPdf,
  type AttendanceReportData,
  type BulletinBranding,
  type BulletinOptionsData,
  type EnrollmentReportData,
  type GradesReportData,
  type StudentBulletinData,
  type BulletinSubject,
} from '../api/reports.api'

type Tab = 'bulletin' | 'grades' | 'attendance' | 'enrollment'

interface Assignment {
  id: string
  subject: { name: string }
  parallel: { id: string; name: string; level: { name: string; attendanceMode?: string } }
  academicYear: { id: string; name: string }
}

interface AcademicYear {
  id: string
  name: string
  isActive: boolean
}

interface Parallel {
  id: string
  name: string
  level: { name: string }
}

interface Period {
  id: string
  name: string
  periodNumber: number
}

const DEFAULT_BRANDING: BulletinBranding = {
  institutionName: '',
  title: 'INFORME DE CALIFICACIONES',
  subtitle: '',
  logoUrl: '',
  directorName: '',
  directorRole: 'DIRECTOR/A',
  teacherLabel: 'DOCENTE TUTOR/A',
  behaviorLabel: 'COMPORTAMIENTO',
  behaviorText: '',
  observationsLabel: 'OBSERVACIONES',
}

export function ReportsPage() {
  const [tab, setTab] = React.useState<Tab>('bulletin')

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="mt-1 text-sm text-muted-foreground">Genera e imprime reportes del sistema</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {([
          { id: 'bulletin' as const, label: 'Boletín', icon: ScrollText },
          { id: 'grades' as const, label: 'Calificaciones', icon: BarChart2 },
          { id: 'attendance' as const, label: 'Asistencia', icon: ClipboardList },
          { id: 'enrollment' as const, label: 'Nómina', icon: FileText },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'bulletin' && <BulletinReportTab />}
      {tab === 'grades' && <GradesReportTab />}
      {tab === 'attendance' && <AttendanceReportTab />}
      {tab === 'enrollment' && <EnrollmentReportTab />}
    </div>
  )
}

function BulletinReportTab() {
  const { hasPermission, hasAnyRole } = usePermissions()
  const canEditGlobal = hasPermission('academic_config:manage')
  const canEditOwn = hasAnyRole('teacher', 'admin', 'inspector')

  const [selectedYearId, setSelectedYearId] = React.useState('')
  const [selectedParallelId, setSelectedParallelId] = React.useState('')
  const [selectedStudentId, setSelectedStudentId] = React.useState('')
  const [enabled, setEnabled] = React.useState(false)
  const [isDownloadingPdf, setIsDownloadingPdf] = React.useState(false)
  const [globalForm, setGlobalForm] = React.useState<BulletinBranding>(DEFAULT_BRANDING)
  const [ownForm, setOwnForm] = React.useState<BulletinBranding>({ ...DEFAULT_BRANDING, enabled: false })

  const { data: branding, refetch: refetchBranding } = useQuery({
    queryKey: ['bulletin-branding'],
    queryFn: getBulletinBranding,
  })

  React.useEffect(() => {
    if (!branding) return
    setGlobalForm({ ...DEFAULT_BRANDING, ...branding.global })
    setOwnForm({ ...DEFAULT_BRANDING, enabled: false, ...(branding.own ?? {}) })
  }, [branding])

  const {
    data: options,
    error: optionsError,
    isError: optionsIsError,
  } = useQuery({
    queryKey: ['bulletin-options', selectedYearId, selectedParallelId],
    queryFn: () => getBulletinOptions({
      ...(selectedYearId ? { yearId: selectedYearId } : {}),
      ...(selectedParallelId ? { parallelId: selectedParallelId } : {}),
    }),
  })

  React.useEffect(() => {
    if (!options?.years.length || selectedYearId) return
    const preferred = options.years.find((y) => y.isActive) ?? options.years[0]
    if (preferred) setSelectedYearId(preferred.id)
  }, [options?.years, selectedYearId])

  const globalSave = useMutation({
    mutationFn: saveGlobalBulletinBranding,
    onSuccess: async () => {
      toast.success('Configuración global guardada')
      await refetchBranding()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const ownSave = useMutation({
    mutationFn: saveOwnBulletinBranding,
    onSuccess: async () => {
      toast.success('Configuración del docente guardada')
      await refetchBranding()
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const {
    data: report,
    isLoading,
    isFetching: isGenerating,
    error: reportError,
    isError: reportIsError,
  } = useQuery({
    queryKey: ['student-bulletin', selectedYearId, selectedParallelId, selectedStudentId],
    queryFn: () =>
      getStudentBulletin({
        yearId: selectedYearId,
        parallelId: selectedParallelId,
        studentId: selectedStudentId,
      }),
    enabled: enabled && !!selectedYearId && !!selectedParallelId && !!selectedStudentId,
  })

  React.useEffect(() => {
    if (optionsError) toast.error(getErrorMessage(optionsError))
  }, [optionsError])

  React.useEffect(() => {
    if (reportError) toast.error(getErrorMessage(reportError))
  }, [reportError])

  async function handleLogoUpload(scope: 'global' | 'own', file: File) {
    try {
      const result = await uploadBulletinLogo(scope, file)
      if (scope === 'global') {
        setGlobalForm((prev) => ({ ...prev, logoUrl: result.url }))
      } else {
        setOwnForm((prev) => ({ ...prev, enabled: true, logoUrl: result.url }))
      }
      toast.success('Logo subido correctamente')
    } catch (err) {
      toast.error(getErrorMessage(err))
    }
  }

  async function handlePdfDownload() {
    setIsDownloadingPdf(true)
    try {
      await downloadBulletinPdf({
        yearId: selectedYearId,
        parallelId: selectedParallelId,
        studentId: selectedStudentId,
      })
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setIsDownloadingPdf(false)
    }
  }

  const years = options?.years ?? []
  const parallels = options?.parallels ?? []
  const students = options?.students ?? []

  const reportHasContent = !!report && (report.subjects.length > 0 || report.attendanceByPeriod.length > 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div className="space-y-4 rounded-xl border p-4">
          <div>
            <h2 className="font-semibold">Configuración del boletín</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Puedes dejar un formato global para toda la institución y permitir que el docente lo sobrescriba.
            </p>
          </div>

          {canEditGlobal && (
            <BrandingForm
              title="Global"
              description="Encabezado oficial por defecto."
              value={globalForm}
              onChange={setGlobalForm}
              onSave={() => globalSave.mutate(globalForm)}
              onUploadLogo={(file) => handleLogoUpload('global', file)}
              saving={globalSave.isPending}
            />
          )}

          {canEditOwn && (
            <BrandingForm
              title="Mi versión"
              description="El docente puede activar su propia portada sin perder la base institucional."
              value={ownForm}
              onChange={setOwnForm}
              onSave={() => ownSave.mutate({ ...ownForm, enabled: ownForm.enabled ?? true })}
              onUploadLogo={(file) => handleLogoUpload('own', file)}
              saving={ownSave.isPending}
              showEnableToggle
            />
          )}
        </div>

        <div className="space-y-4 rounded-xl border p-4">
          <div>
            <h2 className="font-semibold">Generar boletín</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Selecciona año, paralelo y estudiante para generar el formato imprimible.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Año lectivo</Label>
              <Select value={selectedYearId} onValueChange={(v) => {
                setSelectedYearId(v)
                setSelectedParallelId('')
                setSelectedStudentId('')
                setEnabled(false)
              }}>
                <SelectTrigger><SelectValue placeholder="Selecciona año" /></SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Paralelo</Label>
              <Select value={selectedParallelId} onValueChange={(v) => {
                setSelectedParallelId(v)
                setSelectedStudentId('')
                setEnabled(false)
              }} disabled={!selectedYearId}>
                <SelectTrigger><SelectValue placeholder="Selecciona paralelo" /></SelectTrigger>
                <SelectContent>
                  {parallels.map((parallel) => (
                    <SelectItem key={parallel.id} value={parallel.id}>
                      {parallel.level.name} {parallel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estudiante</Label>
              <Select value={selectedStudentId} onValueChange={(v) => {
                setSelectedStudentId(v)
                setEnabled(false)
              }} disabled={!selectedParallelId}>
                <SelectTrigger><SelectValue placeholder="Selecciona estudiante" /></SelectTrigger>
                <SelectContent>
                  {students.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.profile.lastName} {student.profile.firstName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              onClick={() => setEnabled(true)}
              disabled={!selectedYearId || !selectedParallelId || !selectedStudentId}
              loading={isGenerating}
              className="w-full sm:w-auto"
            >
              {isGenerating ? 'Generando boletín…' : 'Generar boletín'}
            </Button>
            {report && (
              <Button variant="outline" onClick={() => window.print()} className="w-full sm:w-auto print:hidden">
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            )}
            {report && (
              <Button
                variant="outline"
                onClick={handlePdfDownload}
                loading={isDownloadingPdf}
                className="w-full sm:w-auto print:hidden"
              >
                {!isDownloadingPdf && <Download className="h-4 w-4" />}
                {isDownloadingPdf ? 'Generando PDF…' : 'Descargar PDF'}
              </Button>
            )}
          </div>

          {isLoading && <PageLoader />}
          {optionsIsError && (
            <EmptyState
              icon={ScrollText}
              title="No se pudieron cargar las opciones"
              description={getErrorMessage(optionsError)}
            />
          )}
          {reportIsError && !isLoading && (
            <EmptyState
              icon={ScrollText}
              title="No se pudo generar el boletín"
              description={getErrorMessage(reportError)}
            />
          )}
          {reportHasContent && !isLoading && !reportIsError && <BulletinReportView data={report} />}
          {enabled && report && !reportHasContent && !isLoading && !reportIsError && (
            <EmptyState
              icon={ScrollText}
              title="Sin datos para este boletín"
              description="El estudiante no tiene suficientes notas o registros para generar el formato todavía."
            />
          )}
          {!enabled && (
            <EmptyState
              icon={ScrollText}
              title="Configura y selecciona un estudiante"
              description="Luego haz clic en Generar boletín"
            />
          )}
        </div>
      </div>
    </div>
  )
}

interface BrandingFormProps {
  title: string
  description: string
  value: BulletinBranding
  onChange: React.Dispatch<React.SetStateAction<BulletinBranding>>
  onSave: () => void
  onUploadLogo: (file: File) => void
  saving: boolean
  showEnableToggle?: boolean
}

function BrandingForm({
  title,
  description,
  value,
  onChange,
  onSave,
  onUploadLogo,
  saving,
  showEnableToggle,
}: BrandingFormProps) {
  const disabled = showEnableToggle && !value.enabled

  function update<K extends keyof BulletinBranding>(key: K, nextValue: BulletinBranding[K]) {
    onChange((prev) => ({ ...prev, [key]: nextValue }))
  }

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          {showEnableToggle && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={value.enabled ?? false}
                onChange={(e) => update('enabled', e.target.checked)}
              />
              Activar
            </label>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Logo</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={value.logoUrl ?? ''}
              onChange={(e) => update('logoUrl', e.target.value)}
              placeholder="/uploads/reports/logo.png"
              disabled={disabled}
            />
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm">
              <Upload className="h-4 w-4" />
              Subir
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={disabled}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) onUploadLogo(file)
                  e.currentTarget.value = ''
                }}
              />
            </label>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Nombre institución</Label>
          <Input value={value.institutionName ?? ''} onChange={(e) => update('institutionName', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input value={value.title ?? ''} onChange={(e) => update('title', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Subtítulo</Label>
          <Input value={value.subtitle ?? ''} onChange={(e) => update('subtitle', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Nombre director/a</Label>
          <Input value={value.directorName ?? ''} onChange={(e) => update('directorName', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Cargo director/a</Label>
          <Input value={value.directorRole ?? ''} onChange={(e) => update('directorRole', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Etiqueta docente</Label>
          <Input value={value.teacherLabel ?? ''} onChange={(e) => update('teacherLabel', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5">
          <Label>Etiqueta comportamiento</Label>
          <Input value={value.behaviorLabel ?? ''} onChange={(e) => update('behaviorLabel', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Texto comportamiento</Label>
          <Input value={value.behaviorText ?? ''} onChange={(e) => update('behaviorText', e.target.value)} disabled={disabled} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Etiqueta observaciones</Label>
          <Input value={value.observationsLabel ?? ''} onChange={(e) => update('observationsLabel', e.target.value)} disabled={disabled} />
        </div>
      </div>

      <Button onClick={onSave} loading={saving} disabled={disabled && showEnableToggle}>
        Guardar
      </Button>
    </div>
  )
}

function BulletinReportView({ data }: { data: StudentBulletinData }) {
  const tutorName = data.parallel.tutor?.profile
    ? `${data.parallel.tutor.profile.firstName} ${data.parallel.tutor.profile.lastName}`
    : ''
  const printDate = new Date().toLocaleDateString('es-EC')

  // Escala cualitativa configurable por la institución (con fallback)
  const qualScale = data.gradingConfig?.qualitativeScale ?? [
    { min: 9, max: 10, code: 'DAR', label: 'Domina los aprendizajes' },
    { min: 7, max: 8.99, code: 'AAR', label: 'Alcanza los aprendizajes' },
    { min: 4.01, max: 6.99, code: 'PAAR', label: 'Está próximo a alcanzar' },
    { min: 0, max: 4, code: 'NAAR', label: 'No alcanza los aprendizajes' },
  ]
  const valueScale = data.qualitativeValueScale ?? []
  const scaleRows = qualScale.map((s) => ({
    range: `${s.min.toFixed(2)} - ${s.max.toFixed(2)}`,
    qualitative: s.label,
    // Códigos de valor (+/−) cuyo rango cae dentro de esta banda cuantitativa.
    value:
      valueScale
        .filter((v) => v.min >= s.min && v.max <= s.max)
        .map((v) => v.code)
        .join(' · ') || s.code,
  }))

  // Comportamiento real capturado por periodo (con su escala A–E configurable)
  const behaviorScale = data.gradingConfig?.behaviorScale ?? []
  const behaviorByPeriodMap = new Map((data.behaviorByPeriod ?? []).map((b) => [b.periodId, b]))
  const behaviorLabelFor = (code: string | null) =>
    code ? behaviorScale.find((s) => s.code === code)?.label ?? code : '—'

  return (
    <div className="space-y-4">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body * { visibility: hidden; }
          .print-sheet, .print-sheet * { visibility: visible; }
          .print-sheet { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <div className="print-sheet min-w-[1100px] p-4 text-black">
          <div className="mb-4 flex items-start justify-between gap-4 border-b pb-3">
            <div className="flex items-start gap-3">
              {data.branding.logoUrl ? (
                <img
                  src={data.branding.logoUrl.startsWith('http') ? data.branding.logoUrl : `${import.meta.env.VITE_API_URL ?? ''}${data.branding.logoUrl}`}
                  alt="Logo institución"
                  className="h-16 w-16 object-contain"
                />
              ) : (
                <div className="h-16 w-16 rounded border" />
              )}
              <div>
                <p className="text-lg font-bold uppercase">{data.branding.institutionName || data.institution.name}</p>
                <p className="text-sm font-semibold uppercase">{data.branding.title || 'INFORME DE CALIFICACIONES'}</p>
                {data.branding.subtitle && <p className="text-xs">{data.branding.subtitle}</p>}
                <p className="mt-1 text-xs">{data.academicYear.name}</p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p><span className="font-semibold">Fecha:</span> {printDate}</p>
              <p><span className="font-semibold">Curso:</span> {data.parallel.level.name}</p>
              <p><span className="font-semibold">Paralelo:</span> {data.parallel.name}</p>
            </div>
          </div>

          <div className="mb-4 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
            <InfoCell label="Estudiante" value={`${data.student.profile.lastName} ${data.student.profile.firstName}`} />
            <InfoCell label="Cédula" value={data.student.profile.dni ?? '—'} />
            <InfoCell label={data.branding.teacherLabel || 'DOCENTE TUTOR/A'} value={tutorName || '—'} />
            <InfoCell label="Promedio final" value={formatScore(data.overallAverage)} />
          </div>

          {(() => {
            const academic = data.subjects
            const qualitative = data.qualitativeSubjects ?? []
            const gradeFor = (s: BulletinSubject, periodId: string) =>
              s.periodGrades.find((g) => g.periodId === periodId)
            const periodGeneral = (periodId: string) => {
              const vals = academic
                .map((s) => gradeFor(s, periodId)?.total)
                .filter((v): v is number => v != null)
              return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
            }
            return (
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th rowSpan={2} className="border px-2 py-1.5">N°</th>
                    <th rowSpan={2} className="border px-2 py-1.5 text-left">Asignatura</th>
                    {data.periods.map((period) => (
                      <th key={period.id} colSpan={4} className="border px-2 py-1.5">
                        {period.name.toUpperCase()}
                      </th>
                    ))}
                    <th rowSpan={2} className="border px-2 py-1.5">SUPLE.</th>
                    <th rowSpan={2} className="border px-2 py-1.5">PROM. FINAL</th>
                  </tr>
                  <tr>
                    {data.periods.map((period) => (
                      <React.Fragment key={`${period.id}-headers`}>
                        <th className="border px-1 py-1 font-normal">Form.<div className="text-[9px] text-gray-500">70%</div></th>
                        <th className="border px-1 py-1 font-normal">Exam.<div className="text-[9px] text-gray-500">15%</div></th>
                        <th className="border px-1 py-1 font-normal">Proy.<div className="text-[9px] text-gray-500">15%</div></th>
                        <th className="border px-1 py-1">Prom.</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {academic.map((subject, index) => (
                    <tr key={subject.assignmentId}>
                      <td className="border px-2 py-1 text-center">{index + 1}</td>
                      <td className="border px-2 py-1 font-medium">{subject.subjectName}</td>
                      {data.periods.map((period) => {
                        const g = gradeFor(subject, period.id)
                        return (
                          <React.Fragment key={`${subject.assignmentId}-${period.id}`}>
                            <td className="border px-1 py-1 text-center">{formatScore(g?.regularAvg ?? null)}</td>
                            <td className="border px-1 py-1 text-center">{formatScore(g?.examenAvg ?? null)}</td>
                            <td className="border px-1 py-1 text-center">{formatScore(g?.proyectoAvg ?? null)}</td>
                            <td className="border px-1 py-1 text-center font-semibold">{formatScore(g?.total ?? null)}</td>
                          </React.Fragment>
                        )
                      })}
                      <td className="border px-2 py-1 text-center">{formatScore(subject.supletorio ?? null)}</td>
                      <td className="border px-2 py-1 text-center font-bold">{formatScore(subject.promFinal ?? subject.finalAverage)}</td>
                    </tr>
                  ))}
                  {/* PROM. general por trimestre (solo materias cuantitativas) */}
                  <tr className="bg-gray-50 font-semibold">
                    <td className="border px-2 py-1" />
                    <td className="border px-2 py-1 text-right">PROM.</td>
                    {data.periods.map((period) => (
                      <td key={`gen-${period.id}`} colSpan={4} className="border px-2 py-1 text-center">
                        {formatScore(periodGeneral(period.id))}
                      </td>
                    ))}
                    <td className="border px-2 py-1" />
                    <td className="border px-2 py-1 text-center">{formatScore(data.overallAverage)}</td>
                  </tr>
                  {/* Materias cualitativas: se muestran como letra y NO promedian */}
                  {qualitative.map((subject, index) => (
                    <tr key={subject.assignmentId} className="bg-amber-50/40">
                      <td className="border px-2 py-1 text-center">{academic.length + index + 1}</td>
                      <td className="border px-2 py-1 font-medium">{subject.subjectName}</td>
                      {data.periods.map((period) => (
                        <td key={`q-${subject.assignmentId}-${period.id}`} colSpan={4} className="border px-2 py-1 text-center font-semibold">
                          {gradeFor(subject, period.id)?.code ?? '—'}
                        </td>
                      ))}
                      <td className="border px-2 py-1" />
                      <td className="border px-2 py-1 text-center font-bold">{subject.finalCode ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}

          <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
            <div className="space-y-3">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="border px-2 py-1.5" colSpan={data.periods.length}>
                      {data.branding.behaviorLabel || 'COMPORTAMIENTO'}
                    </th>
                  </tr>
                  <tr>
                    {data.periods.map((period) => (
                      <th key={`behavior-${period.id}`} className="border px-2 py-1.5">{period.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {data.periods.map((period) => {
                      const b = behaviorByPeriodMap.get(period.id)
                      const code = b?.code ?? null
                      return (
                        <td
                          key={`behavior-body-${period.id}`}
                          className="border px-2 py-2 text-center align-top"
                        >
                          <div className="font-semibold" title={behaviorLabelFor(code)}>{code ?? '—'}</div>
                          {b?.notes && <div className="mt-1 text-[10px] text-gray-600">{b.notes}</div>}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
              {behaviorScale.length > 0 && (
                <p className="text-[10px] text-gray-600">
                  {behaviorScale.map((s) => `${s.code} = ${s.label}`).join(' · ')}
                </p>
              )}

              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="border px-2 py-1.5">Indicador</th>
                    {data.periods.map((period) => (
                      <th key={period.id} className="border px-2 py-1.5">{period.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <AttendanceRow
                    label="Faltas justificadas"
                    values={data.attendanceByPeriod.map((item) => item.justifiedAbsences)}
                  />
                  <AttendanceRow
                    label="Faltas injustificadas"
                    values={data.attendanceByPeriod.map((item) => item.unjustifiedAbsences)}
                  />
                  <AttendanceRow
                    label="Total días asistidos"
                    values={data.attendanceByPeriod.map((item) => item.attendedDays)}
                  />
                  <AttendanceRow
                    label="Atrasos"
                    values={data.attendanceByPeriod.map((item) => item.lateCount)}
                  />
                  <tr>
                    <td className="border px-2 py-3 font-semibold">{data.branding.observationsLabel || 'OBSERVACIONES'}</td>
                    <td className="border px-2 py-3" colSpan={data.periods.length} />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-3">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="border px-2 py-1.5">Escala cuantitativa</th>
                    <th className="border px-2 py-1.5">Escala cualitativa</th>
                    <th className="border px-2 py-1.5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {scaleRows.map((row) => (
                    <tr key={row.value}>
                      <td className="border px-2 py-1">{row.range}</td>
                      <td className="border px-2 py-1">{row.qualitative}</td>
                      <td className="border px-2 py-1 text-center">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="grid grid-cols-2 gap-6 pt-8 text-center text-[11px]">
                <div>
                  <div className="border-t pt-2 font-semibold">{data.branding.directorName || ' '}</div>
                  <div>{data.branding.directorRole || 'DIRECTOR/A'}</div>
                </div>
                <div>
                  <div className="border-t pt-2 font-semibold">{tutorName || ' '}</div>
                  <div>{data.branding.teacherLabel || 'DOCENTE TUTOR/A'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border px-2 py-1.5">
      <span className="font-semibold">{label}: </span>
      <span>{value}</span>
    </div>
  )
}

function AttendanceRow({ label, values }: { label: string; values: number[] }) {
  return (
    <tr>
      <td className="border px-2 py-1">{label}</td>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className="border px-2 py-1 text-center">
          {value}
        </td>
      ))}
    </tr>
  )
}

function formatScore(value: number | null) {
  return value != null ? value.toFixed(2) : '—'
}

function GradesReportTab() {
  const [assignmentId, setAssignmentId] = React.useState('')
  const [periodId, setPeriodId] = React.useState('')
  const [enabled, setEnabled] = React.useState(false)

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments-report'],
    queryFn: () => apiGet<Assignment[]>('academic/course-assignments'),
  })

  const selected = assignments.find((assignment) => assignment.id === assignmentId)

  const { data: periods = [] } = useQuery({
    queryKey: ['periods-report', selected?.academicYear.id],
    queryFn: () => apiGet<Period[]>(`academic/years/${selected!.academicYear.id}/periods`),
    enabled: !!selected,
  })

  const { data: report, isLoading, isFetching: isGenerating } = useQuery({
    queryKey: ['report-grades', assignmentId, periodId],
    queryFn: () => getGradesReport({ courseAssignmentId: assignmentId, periodId }),
    enabled: enabled && !!assignmentId && !!periodId,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full space-y-1.5 sm:w-72">
          <Label>Asignación</Label>
          <Select value={assignmentId} onValueChange={(value) => {
            setAssignmentId(value)
            setPeriodId('')
            setEnabled(false)
          }}>
            <SelectTrigger><SelectValue placeholder="Selecciona asignación" /></SelectTrigger>
            <SelectContent>
              {assignments.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>
                  {assignment.parallel.level.name} {assignment.parallel.name} / {assignment.subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-48">
          <Label>Período</Label>
          <Select value={periodId} onValueChange={(value) => {
            setPeriodId(value)
            setEnabled(false)
          }} disabled={!assignmentId}>
            <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEnabled(true)} disabled={!assignmentId || !periodId} loading={isGenerating} className="w-full sm:w-auto">
          {isGenerating ? 'Generando calificaciones…' : 'Generar reporte'}
        </Button>
      </div>

      {isLoading && <PageLoader />}
      {report && !isLoading && <GradesReportView data={report} />}
      {!enabled && <EmptyState icon={BarChart2} title="Selecciona asignación y período" description="Luego haz clic en Generar reporte" />}
    </div>
  )
}

function GradesReportView({ data }: { data: GradesReportData }) {
  const allActivities = data.insumos.flatMap((insumo) =>
    insumo.activities.map((activity) => ({ ...activity, insumoName: insumo.name })),
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {data.assignment.parallel.level.name} {data.assignment.parallel.name} · {data.assignment.subject.name} · {data.assignment.academicYear.name}
        </p>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="w-full sm:w-auto">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="w-8 border px-2 py-1.5 text-left font-medium">#</th>
              <th className="min-w-[160px] border px-2 py-1.5 text-left font-medium">Estudiante</th>
              {allActivities.map((activity) => (
                <th key={activity.id} className="min-w-[56px] border px-2 py-1.5 text-center font-medium">
                  <div className="text-[10px] text-muted-foreground">{activity.insumoName}</div>
                  <div>{activity.name}</div>
                  <div className="text-[10px] font-normal">/{Number(activity.maxScore)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((student, index) => (
              <tr key={student.student.id} className="hover:bg-muted/30">
                <td className="border px-2 py-1 text-center">{index + 1}</td>
                <td className="border px-2 py-1">
                  {student.student.profile.lastName} {student.student.profile.firstName}
                  {student.student.profile.dni && (
                    <span className="ml-1 text-[10px] text-muted-foreground">{student.student.profile.dni}</span>
                  )}
                </td>
                {allActivities.map((activity) => (
                  <td key={activity.id} className="border px-2 py-1 text-center">
                    {student.grades[activity.id] != null ? Number(student.grades[activity.id]).toFixed(2) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const STATUS_SHORT: Record<string, string> = { present: 'P', absent: 'A', late: 'T', excused: 'J' }
const STATUS_CLASS: Record<string, string> = {
  present: 'text-green-600',
  absent: 'text-red-600 font-semibold',
  late: 'text-yellow-600',
  excused: 'text-blue-600',
}

function AttendanceReportTab() {
  const [assignmentId, setAssignmentId] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [enabled, setEnabled] = React.useState(false)

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments-att-report'],
    queryFn: () => apiGet<Assignment[]>('academic/course-assignments'),
  })

  const selectedAssignment = assignments.find((a) => a.id === assignmentId)
  const isDailyMode = selectedAssignment?.parallel.level.attendanceMode === 'daily'

  const { data: report, isLoading, isFetching: isGenerating } = useQuery({
    queryKey: ['report-attendance', assignmentId, startDate, endDate],
    queryFn: () => isDailyMode
      ? getAttendanceReport({ parallelId: selectedAssignment!.parallel.id, startDate, endDate })
      : getAttendanceReport({ courseAssignmentId: assignmentId, startDate, endDate }),
    enabled: enabled && !!assignmentId && !!startDate && !!endDate,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full space-y-1.5 sm:w-72">
          <Label>Asignación</Label>
          <Select value={assignmentId} onValueChange={(value) => {
            setAssignmentId(value)
            setEnabled(false)
          }}>
            <SelectTrigger><SelectValue placeholder="Selecciona asignación" /></SelectTrigger>
            <SelectContent>
              {assignments.map((assignment) => (
                <SelectItem key={assignment.id} value={assignment.id}>
                  {assignment.parallel.level.name} {assignment.parallel.name} / {assignment.subject.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Desde</Label>
          <Input type="date" value={startDate} onChange={(e) => {
            setStartDate(e.target.value)
            setEnabled(false)
          }} className="w-full sm:w-40" />
        </div>
        <div className="space-y-1.5">
          <Label>Hasta</Label>
          <Input type="date" value={endDate} onChange={(e) => {
            setEndDate(e.target.value)
            setEnabled(false)
          }} className="w-full sm:w-40" />
        </div>
        <Button onClick={() => setEnabled(true)} disabled={!assignmentId || !startDate || !endDate} loading={isGenerating} className="w-full sm:w-auto">
          {isGenerating ? 'Generando asistencia…' : 'Generar reporte'}
        </Button>
      </div>

      {isLoading && <PageLoader />}
      {report && !isLoading && <AttendanceReportView data={report} />}
      {!enabled && <EmptyState icon={ClipboardList} title="Selecciona asignación y rango de fechas" description="Luego haz clic en Generar reporte" />}
    </div>
  )
}

function AttendanceReportView({ data }: { data: AttendanceReportData }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            {data.assignment.parallel.level.name} {data.assignment.parallel.name} · {data.assignment.subject.name}
          </p>
          <p className="text-xs text-muted-foreground">P=Presente · A=Ausente · T=Tarde · J=Justificado</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="w-full sm:w-auto">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="bg-muted">
              <th className="w-8 border px-2 py-1.5 text-left font-medium">#</th>
              <th className="min-w-[160px] border px-2 py-1.5 text-left font-medium">Estudiante</th>
              {data.dates.map((date) => (
                <th key={date} className="min-w-[36px] border px-1 py-1.5 text-center font-medium">
                  {new Date(`${date}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })}
                </th>
              ))}
              <th className="border px-2 py-1.5 text-center text-green-700">P</th>
              <th className="border px-2 py-1.5 text-center text-red-600">A</th>
              <th className="border px-2 py-1.5 text-center text-yellow-600">T</th>
              <th className="border px-2 py-1.5 text-center text-blue-600">J</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((student, index) => {
              const counts = { present: 0, absent: 0, late: 0, excused: 0 }
              for (const date of data.dates) {
                const status = student.records[date] as keyof typeof counts | undefined
                if (status && status in counts) counts[status]++
              }

              return (
                <tr key={student.student.id} className="hover:bg-muted/30">
                  <td className="border px-2 py-1 text-center">{index + 1}</td>
                  <td className="border px-2 py-1">{student.student.profile.lastName} {student.student.profile.firstName}</td>
                  {data.dates.map((date) => (
                    <td key={date} className={`border px-1 py-1 text-center ${STATUS_CLASS[student.records[date]] ?? 'text-muted-foreground'}`}>
                      {STATUS_SHORT[student.records[date]] ?? '·'}
                    </td>
                  ))}
                  <td className="border px-2 py-1 text-center text-green-600">{counts.present}</td>
                  <td className="border px-2 py-1 text-center text-red-600">{counts.absent}</td>
                  <td className="border px-2 py-1 text-center text-yellow-600">{counts.late}</td>
                  <td className="border px-2 py-1 text-center text-blue-600">{counts.excused}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EnrollmentReportTab() {
  const [yearId, setYearId] = React.useState('')
  const [parallelId, setParallelId] = React.useState('')
  const [enabled, setEnabled] = React.useState(false)

  const { data: years = [] } = useQuery({
    queryKey: ['years-report'],
    queryFn: () => apiGet<AcademicYear[]>('academic/years'),
  })

  const { data: parallels = [] } = useQuery({
    queryKey: ['parallels-report', yearId],
    queryFn: () => apiGet<Parallel[]>('academic/parallels', { yearId }),
    enabled: !!yearId,
  })

  const { data: report, isLoading, isFetching: isGenerating } = useQuery({
    queryKey: ['report-enrollment', yearId, parallelId],
    queryFn: () => getEnrollmentReport({ yearId, ...(parallelId ? { parallelId } : {}) }),
    enabled: enabled && !!yearId,
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full space-y-1.5 sm:w-52">
          <Label>Año lectivo</Label>
          <Select value={yearId} onValueChange={(value) => {
            setYearId(value)
            setParallelId('')
            setEnabled(false)
          }}>
            <SelectTrigger><SelectValue placeholder="Año" /></SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year.id} value={year.id}>
                  {year.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full space-y-1.5 sm:w-52">
          <Label>Paralelo (opcional)</Label>
          <Select value={parallelId || '__all__'} onValueChange={(value) => {
            setParallelId(value === '__all__' ? '' : value)
            setEnabled(false)
          }} disabled={!yearId}>
            <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los paralelos</SelectItem>
              {parallels.map((parallel) => (
                <SelectItem key={parallel.id} value={parallel.id}>
                  {parallel.level.name} {parallel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => setEnabled(true)} disabled={!yearId} loading={isGenerating} className="w-full sm:w-auto">
          {isGenerating ? 'Generando nómina…' : 'Generar nómina'}
        </Button>
      </div>

      {isLoading && <PageLoader />}
      {report && !isLoading && <EnrollmentReportView data={report} />}
      {!enabled && <EmptyState icon={FileText} title="Selecciona un año lectivo" description="Luego haz clic en Generar nómina" />}
    </div>
  )
}

function EnrollmentReportView({ data }: { data: EnrollmentReportData }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">Año: {data.year.name} · {data.totalEnrollments} estudiantes</p>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="w-full sm:w-auto">
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {data.parallels.map(({ parallel, enrollments }) => (
        <div key={parallel.id} className="space-y-2">
          <h3 className="text-sm font-semibold">
            {parallel.level.name} — Paralelo {parallel.name} ({enrollments.length} estudiantes)
          </h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] border-collapse text-xs">
              <thead>
                <tr className="bg-muted">
                  <th className="w-8 border px-2 py-1.5 text-left font-medium">#</th>
                  <th className="border px-2 py-1.5 text-left font-medium">Apellidos</th>
                  <th className="border px-2 py-1.5 text-left font-medium">Nombres</th>
                  <th className="border px-2 py-1.5 text-left font-medium">Cédula</th>
                  <th className="border px-2 py-1.5 text-left font-medium">Fecha nac.</th>
                  <th className="border px-2 py-1.5 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((enrollment, index) => (
                  <tr key={enrollment.id} className="hover:bg-muted/30">
                    <td className="border px-2 py-1 text-center">{index + 1}</td>
                    <td className="border px-2 py-1">{enrollment.student.profile.lastName}</td>
                    <td className="border px-2 py-1">{enrollment.student.profile.firstName}</td>
                    <td className="border px-2 py-1">{enrollment.student.profile.dni ?? '—'}</td>
                    <td className="border px-2 py-1">
                      {enrollment.student.profile.birthDate
                        ? (() => { const [y,m,d] = enrollment.student.profile.birthDate.slice(0,10).split('-').map(Number); return new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(y,m-1,d)) })()
                        : '—'}
                    </td>
                    <td className="border px-2 py-1">{enrollment.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
