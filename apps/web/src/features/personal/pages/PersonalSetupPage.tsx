import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Plus, Trash2, BookOpen, School, Users, ChevronRight, ChevronLeft, Check, SkipForward } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { personalApi, PersonalSetupDto } from '../api/personal.api'
import { ExcelStudentUpload, ParsedStudent } from '../components/ExcelStudentUpload'
import { useAuthStore } from '@/store/auth.store'
import { useCurriculumAreas } from '@/features/curriculum/hooks/useCurriculum'
import { useCompetencyAreas } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'

type TeachingProfile = 'subject-first' | 'classroom-first' | 'multigrade'
type PlanningModel = 'destrezas' | 'competencias'

interface MultigradeRow {
  gradeCode: string
  subjectAreaId: string
}

interface WizardState {
  profile: TeachingProfile | null
  // subject-first — una sola materia, elegida del catálogo oficial de áreas
  subjectAreaId: string | null
  groups: string[]
  // classroom-first — un solo grupo, varias materias del catálogo oficial de áreas
  parallelName: string
  subjectAreaIds: string[]
  // multigrade — unidocente/pluridocente: N selecciones explícitas grado+materia
  multigradeName: string
  multigradeRows: MultigradeRow[]
  allowSuperiorExtension: boolean
  // year
  yearName: string
  yearStart: string
  yearEnd: string
  // workspace
  workspaceName: string
  // students
  students: ParsedStudent[]
  // currículo — grado REAL que enseña (deriva el subnivel; ver GRADE_OPTIONS) —
  // decide qué banco curricular (destrezas/competencias) y qué saberes por
  // grado (CompetencySaber.gradeCodes) se ofrecen luego al planificar. NUNCA
  // enviar un nivel sintético como "PERSONAL" al backend — sin un grado real
  // el motor de planificación no encuentra saberes disponibles.
  gradeCode: string | null
  planningModel: PlanningModel
}

const STEPS = ['Perfil', 'Currículo', 'Mis clases', 'Año escolar', 'Estudiantes', 'Tu aula']
// Multigrado ya fija su propio subnivel por fila (grado -> subnivel, resuelto en el
// backend) y siempre usa el modelo por Competencias — el paso "Currículo" no aplica
// y se salta automáticamente (ver goNext/goBack).
const MULTIGRADE_STEPS = ['Perfil', 'Mis grados', 'Año escolar', 'Estudiantes', 'Tu aula']

// Grado REAL que enseña el docente (subject-first/classroom-first) — mismo
// catálogo que GRADE_CATALOG (apps/api/src/shared/domain/grade-catalog.ts),
// incluyendo Inicial y BGU (a diferencia de MULTIGRADE_GRADE_OPTIONS abajo,
// que excluye BGU por regla de negocio de multigrado, no de este flujo). El
// subnivel ya no se pregunta por separado — se deriva de este grado.
const GRADE_OPTIONS: Array<{ value: string; label: string; hint: string }> = [
  { value: 'INICIAL', label: 'Inicial', hint: 'Maternal / 3 a 5 años' },
  { value: '1B', label: '1ro de Básica', hint: 'Preparatoria' },
  { value: '2B', label: '2do de Básica', hint: 'Elemental' },
  { value: '3B', label: '3ro de Básica', hint: 'Elemental' },
  { value: '4B', label: '4to de Básica', hint: 'Elemental' },
  { value: '5B', label: '5to de Básica', hint: 'Media' },
  { value: '6B', label: '6to de Básica', hint: 'Media' },
  { value: '7B', label: '7mo de Básica', hint: 'Media' },
  { value: '8B', label: '8vo de Básica', hint: 'Superior' },
  { value: '9B', label: '9no de Básica', hint: 'Superior' },
  { value: '10B', label: '10mo de Básica', hint: 'Superior' },
  { value: '1BGU', label: '1ro de Bachillerato', hint: 'BGU' },
  { value: '2BGU', label: '2do de Bachillerato', hint: 'BGU' },
  { value: '3BGU', label: '3ro de Bachillerato', hint: 'BGU' },
]

// Mismo catálogo de grados EGB que DEFAULT_LEVELS (institution-bootstrap.ts) —
// BGU deliberadamente excluido (TIGA Multigrado v1.0: "BGU no está permitido").
const MULTIGRADE_GRADE_OPTIONS: Array<{ value: string; label: string; superior: boolean }> = [
  { value: '1B', label: '1ro de Básica', superior: false },
  { value: '2B', label: '2do de Básica', superior: false },
  { value: '3B', label: '3ro de Básica', superior: false },
  { value: '4B', label: '4to de Básica', superior: false },
  { value: '5B', label: '5to de Básica', superior: false },
  { value: '6B', label: '6to de Básica', superior: false },
  { value: '7B', label: '7mo de Básica', superior: false },
  { value: '8B', label: '8vo de Básica', superior: true },
  { value: '9B', label: '9no de Básica', superior: true },
  { value: '10B', label: '10mo de Básica', superior: true },
]

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 rounded-full transition-all ${
            i < current ? 'bg-blue-500 w-6' : i === current ? 'bg-blue-500 w-8' : 'bg-gray-200 w-4'
          }`}
        />
      ))}
    </div>
  )
}

export function PersonalSetupPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const [step, setStep] = useState(0)
  const [state, setState] = useState<WizardState>({
    profile: null,
    subjectAreaId: null,
    groups: [''],
    parallelName: '',
    subjectAreaIds: [],
    multigradeName: '',
    multigradeRows: [{ gradeCode: '', subjectAreaId: '' }, { gradeCode: '', subjectAreaId: '' }],
    allowSuperiorExtension: false,
    yearName: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    yearStart: `${new Date().getFullYear()}-09-01`,
    yearEnd: `${new Date().getFullYear() + 1}-07-31`,
    workspaceName: '',
    students: [],
    gradeCode: null,
    planningModel: 'destrezas',
  })
  const setInstitution = useAuthStore((s) => s.setInstitution)

  // Multigrado siempre planifica con el modelo por Competencias (CNC) — es el
  // único banco que cubre "preparatoria" (1ro EGB reutiliza su currículo
  // integrado) y el formato que necesita el generador multigrado. El paso
  // "Currículo" del wizard normal no aplica: el flujo usa MULTIGRADE_STEPS.
  const steps = state.profile === 'multigrade' ? MULTIGRADE_STEPS : STEPS
  const stepLabel = steps[step]

  // Catálogo real de áreas MINEDUC de la institución — el docente elige de
  // aquí, nunca escribe el nombre de la materia a mano. Se usa el banco que
  // corresponda al planningModel elegido en el paso anterior del wizard
  // (multigrado siempre usa el de competencias).
  const { data: curriculumAreas = [] } = useCurriculumAreas()
  const { data: competencyAreas = [] } = useCompetencyAreas()
  const effectivePlanningModel = state.profile === 'multigrade' ? 'competencias' : state.planningModel
  const catalogAreas = effectivePlanningModel === 'competencias' ? competencyAreas : curriculumAreas

  const hasSuperiorGradeSelected = state.multigradeRows.some(
    (r) => MULTIGRADE_GRADE_OPTIONS.find((g) => g.value === r.gradeCode)?.superior,
  )

  function setMultigradeRow(index: number, patch: Partial<MultigradeRow>) {
    const next = [...state.multigradeRows]
    next[index] = { ...next[index], ...patch }
    set('multigradeRows', next)
  }

  const setupMutation = useMutation({
    mutationFn: (dto: PersonalSetupDto) => personalApi.setup(dto),
  })

  const bulkStudentsMutation = useMutation({
    mutationFn: ({ students, parallelId, yearId }: { students: ParsedStudent[]; parallelId: string; yearId: string }) =>
      personalApi.bulkCreateStudents({
        students,
        parallelId,
        academicYearId: yearId,
      }),
  })

  async function finish() {
    const dto: PersonalSetupDto = {
      profile: state.profile!,
      yearName: state.yearName,
      yearStart: state.yearStart,
      yearEnd: state.yearEnd,
      workspaceName: state.workspaceName || undefined,
      gradeCode: state.profile === 'multigrade' ? undefined : (state.gradeCode ?? undefined),
      planningModel: state.profile === 'multigrade' ? 'competencias' : state.planningModel,
      ...(state.profile === 'subject-first'
        ? {
            subjectAreaId: state.subjectAreaId ?? undefined,
            groups: state.groups.filter(Boolean).map((name) => ({ name })),
          }
        : state.profile === 'classroom-first'
          ? {
              parallelName: state.parallelName,
              subjectAreaIds: state.subjectAreaIds,
            }
          : {
              multigradeName: state.multigradeName || undefined,
              multigradeSelections: state.multigradeRows
                .filter((r) => r.gradeCode && r.subjectAreaId)
                .map((r) => ({ gradeCode: r.gradeCode, subjectAreaId: r.subjectAreaId })),
              allowSuperiorExtension: state.allowSuperiorExtension,
            }),
    }

    const setup = await setupMutation.mutateAsync(dto) as {
      yearId: string
      parallelIds: string[]
      subjectIds: string[]
      assignmentIds: string[]
      multigradeGroupId: string | null
    }

    if (state.students.length > 0 && setup.parallelIds[0]) {
      await bulkStudentsMutation.mutateAsync({
        students: state.students,
        parallelId: setup.parallelIds[0],
        yearId: setup.yearId,
      })
    }

    // Libera el gate de PrivateRoute de inmediato: sin esto, setupComplete
    // seguiría en false en el store hasta el próximo refresh de token y el
    // usuario quedaría atrapado en /personal/setup tras terminar el wizard.
    const institution = useAuthStore.getState().user?.institution
    if (institution) setInstitution({ ...institution, setupComplete: true })

    navigate('/dashboard', { replace: true })
  }

  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) =>
    setState((s) => ({ ...s, [key]: value }))

  const canNext = () => {
    if (stepLabel === 'Perfil') return state.profile !== null
    if (stepLabel === 'Currículo') return state.gradeCode !== null
    if (stepLabel === 'Mis clases') {
      if (state.profile === 'subject-first') return !!state.subjectAreaId && state.groups.some((g) => g.trim())
      return state.parallelName.trim() && state.subjectAreaIds.length > 0
    }
    if (stepLabel === 'Mis grados') {
      const filled = state.multigradeRows.filter((r) => r.gradeCode && r.subjectAreaId)
      if (filled.length < 2) return false
      if (hasSuperiorGradeSelected && !state.allowSuperiorExtension) return false
      return true
    }
    if (stepLabel === 'Año escolar') return state.yearName.trim() && state.yearStart && state.yearEnd
    return true
  }

  const isLoading = setupMutation.isPending || bulkStudentsMutation.isPending

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border p-8 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <StepIndicator current={step} total={steps.length} />
          <div>
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
              Paso {step + 1} de {steps.length} — {stepLabel}
            </p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              {stepLabel === 'Perfil' && `Hola, ${user?.fullName?.split(' ')[0] ?? 'profe'} 👋`}
              {stepLabel === 'Currículo' && 'Currículo que usas'}
              {stepLabel === 'Mis clases' && 'Configura tus clases'}
              {stepLabel === 'Mis grados' && 'Configura tu aula multigrado'}
              {stepLabel === 'Año escolar' && 'Año escolar'}
              {stepLabel === 'Estudiantes' && 'Agrega a tus estudiantes'}
              {stepLabel === 'Tu aula' && 'Personaliza tu aula'}
            </h1>
          </div>
        </div>

        {/* Step — Perfil */}
        {stepLabel === 'Perfil' && (
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => set('profile', 'subject-first')}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                state.profile === 'subject-first'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <BookOpen className={`w-7 h-7 ${state.profile === 'subject-first' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <p className="font-semibold text-sm text-gray-900">Profe de materia</p>
                <p className="text-xs text-gray-500 mt-0.5">Enseño una materia a varios grupos</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => set('profile', 'classroom-first')}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                state.profile === 'classroom-first'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <School className={`w-7 h-7 ${state.profile === 'classroom-first' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <p className="font-semibold text-sm text-gray-900">Profe de aula</p>
                <p className="text-xs text-gray-500 mt-0.5">Un grado, varias materias</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => set('profile', 'multigrade')}
              className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                state.profile === 'multigrade'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Users className={`w-7 h-7 ${state.profile === 'multigrade' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <p className="font-semibold text-sm text-gray-900">Profe multigrado</p>
                <p className="text-xs text-gray-500 mt-0.5">Varios grados a la vez (unidocente/pluridocente)</p>
              </div>
            </button>
          </div>
        )}

        {/* Step — Currículo (grado real + modelo de planificación) — no aplica a multigrado */}
        {stepLabel === 'Currículo' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>¿Qué grado enseñas?</Label>
              <p className="text-xs text-gray-500">
                Con esto filtramos las competencias, destrezas y saberes oficiales exactos de tu grado
                que verás al planificar — para que luego solo tengas que elegir de una lista y generar con IA, sin buscar nada.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {GRADE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('gradeCode', opt.value)}
                    className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border-2 text-left transition-all ${
                      state.gradeCode === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                    <span className="text-xs text-gray-500">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>¿Con qué currículo planificas?</Label>
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => set('planningModel', 'destrezas')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    state.planningModel === 'destrezas'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">Destrezas (Currículo Priorizado)</p>
                  <p className="text-xs text-gray-500 mt-0.5">El estándar MINEDUC más usado.</p>
                </button>
                <button
                  type="button"
                  onClick={() => set('planningModel', 'competencias')}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    state.planningModel === 'competencias'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">Competencias (CNC)</p>
                  <p className="text-xs text-gray-500 mt-0.5">Currículo Nacional por Competencias.</p>
                </button>
              </div>
              <p className="text-xs text-gray-500">
                No te preocupes por elegir mal: puedes escribirnos para cambiarlo más adelante.
              </p>
            </div>
          </div>
        )}

        {/* Step — Clases */}
        {stepLabel === 'Mis clases' && state.profile === 'subject-first' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>¿Qué materia enseñas?</Label>
              <p className="text-xs text-gray-500">
                Elige del catálogo oficial — así queda vinculada automáticamente a sus destrezas/competencias.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {catalogAreas.map((area) => (
                  <button
                    key={area.id}
                    type="button"
                    onClick={() => set('subjectAreaId', area.id)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
                      state.subjectAreaId === area.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 hover:border-gray-300 text-gray-700'
                    }`}
                  >
                    {area.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>¿A cuáles grupos?</Label>
              {state.groups.map((g, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`ej. 3ro A`}
                    value={g}
                    onChange={(e) => {
                      const next = [...state.groups]
                      next[i] = e.target.value
                      set('groups', next)
                    }}
                  />
                  {state.groups.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-gray-400"
                      onClick={() => set('groups', state.groups.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 px-0"
                onClick={() => set('groups', [...state.groups, ''])}
              >
                <Plus className="w-4 h-4 mr-1" /> Agregar grupo
              </Button>
            </div>
          </div>
        )}

        {stepLabel === 'Mis clases' && state.profile === 'classroom-first' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>¿Cuál es tu grado o aula?</Label>
              <Input
                placeholder="ej. 3ro A"
                value={state.parallelName}
                onChange={(e) => set('parallelName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>¿Qué materias dictas?</Label>
              <p className="text-xs text-gray-500">
                Elige una o varias del catálogo oficial — así quedan vinculadas automáticamente a sus destrezas/competencias.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {catalogAreas.map((area) => {
                  const selected = state.subjectAreaIds.includes(area.id)
                  return (
                    <button
                      key={area.id}
                      type="button"
                      onClick={() =>
                        set(
                          'subjectAreaIds',
                          selected
                            ? state.subjectAreaIds.filter((id) => id !== area.id)
                            : [...state.subjectAreaIds, area.id],
                        )
                      }
                      className={`text-left px-3 py-2 rounded-lg border text-sm transition-colors flex items-center gap-2 ${
                        selected
                          ? 'border-blue-600 bg-blue-50 text-blue-700 font-medium'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                          selected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3 text-white" />}
                      </span>
                      {area.name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step — Mis grados (multigrado: selección explícita grado + materia) */}
        {stepLabel === 'Mis grados' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>¿Cómo se llama tu aula multigrado?</Label>
              <Input
                placeholder="ej. Escuela unidocente"
                value={state.multigradeName}
                onChange={(e) => set('multigradeName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Grados y materias que dictas a la vez</Label>
              <p className="text-xs text-gray-500">
                Elige cada grado y su materia del catálogo oficial — cada combinación crea
                automáticamente su propio grupo y asignación, ya vinculada a su currículo. Mínimo 2.
              </p>
              <div className="space-y-2">
                {state.multigradeRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <select
                      value={row.gradeCode}
                      onChange={(e) => setMultigradeRow(i, { gradeCode: e.target.value })}
                      className="flex-1 h-9 rounded-md border border-gray-200 px-2 text-sm text-gray-700"
                    >
                      <option value="">Grado…</option>
                      {MULTIGRADE_GRADE_OPTIONS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                          {g.superior ? ' (extensión superior)' : ''}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.subjectAreaId}
                      onChange={(e) => setMultigradeRow(i, { subjectAreaId: e.target.value })}
                      className="flex-1 h-9 rounded-md border border-gray-200 px-2 text-sm text-gray-700"
                    >
                      <option value="">Materia…</option>
                      {catalogAreas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                        </option>
                      ))}
                    </select>
                    {state.multigradeRows.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-gray-400"
                        onClick={() => set('multigradeRows', state.multigradeRows.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-blue-600 hover:text-blue-700 px-0"
                onClick={() => set('multigradeRows', [...state.multigradeRows, { gradeCode: '', subjectAreaId: '' }])}
              >
                <Plus className="w-4 h-4 mr-1" /> Agregar grado + materia
              </Button>
            </div>
            {hasSuperiorGradeSelected && (
              <label className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={state.allowSuperiorExtension}
                  onChange={(e) => set('allowSuperiorExtension', e.target.checked)}
                />
                <span>
                  Confirmo la <strong>extensión superior</strong>: incluyo grados de 8vo a 10mo de Básica en mi aula
                  multigrado (fuera de la prioridad estándar 1ro-7mo).
                </span>
              </label>
            )}
          </div>
        )}

        {/* Step — Año escolar */}
        {stepLabel === 'Año escolar' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nombre del año escolar</Label>
              <Input
                placeholder="ej. 2025-2026"
                value={state.yearName}
                onChange={(e) => set('yearName', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Inicio</Label>
                <Input
                  type="date"
                  value={state.yearStart}
                  onChange={(e) => set('yearStart', e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Fin</Label>
                <Input
                  type="date"
                  value={state.yearEnd}
                  onChange={(e) => set('yearEnd', e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Los trimestres se generarán automáticamente. Puedes ajustarlos después desde configuración.
            </p>
          </div>
        )}

        {/* Step — Estudiantes */}
        {stepLabel === 'Estudiantes' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Sube tu lista en Excel o agrega estudiantes manualmente desde el panel más tarde.
            </p>
            <ExcelStudentUpload onStudentsParsed={(students) => set('students', students)} />
          </div>
        )}

        {/* Step — Workspace */}
        {stepLabel === 'Tu aula' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>¿Cómo se llama tu aula o academia?</Label>
              <Input
                placeholder={`Aula de ${user?.fullName?.split(' ')[0] ?? 'profe'}`}
                value={state.workspaceName}
                onChange={(e) => set('workspaceName', e.target.value)}
              />
              <p className="text-xs text-gray-500">Aparecerá en tus reportes y comunicaciones.</p>
            </div>
            <p className="text-sm text-gray-500 bg-blue-50 border border-blue-100 rounded-lg p-3">
              Podrás subir tu logo desde <strong>Configuración → Branding</strong> una vez dentro de la plataforma.
            </p>
          </div>
        )}

        {/* Error */}
        {(setupMutation.error || bulkStudentsMutation.error) && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {((setupMutation.error || bulkStudentsMutation.error) as Error)?.message ?? 'Error al guardar'}
          </p>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="text-gray-500"
          >
            <ChevronLeft className="w-4 h-4 mr-1" /> Atrás
          </Button>

          <div className="flex gap-2">
            {stepLabel === 'Estudiantes' && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-gray-400"
                onClick={() => setStep((s) => s + 1)}
              >
                <SkipForward className="w-4 h-4 mr-1" /> Saltar
              </Button>
            )}

            {step < steps.length - 1 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canNext()}
              >
                Siguiente <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={finish}
                disabled={isLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isLoading ? 'Configurando...' : (
                  <><Check className="w-4 h-4 mr-1" /> Ir al panel</>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
