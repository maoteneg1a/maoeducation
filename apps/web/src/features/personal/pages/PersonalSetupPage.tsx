import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Plus, Trash2, BookOpen, School, ChevronRight, ChevronLeft, Check, SkipForward } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { personalApi, PersonalSetupDto } from '../api/personal.api'
import { ExcelStudentUpload, ParsedStudent } from '../components/ExcelStudentUpload'
import { useAuthStore } from '@/store/auth.store'

type TeachingProfile = 'subject-first' | 'classroom-first'
type Subnivel = 'inicial' | 'preparatoria' | 'elemental' | 'media' | 'superior' | 'bgu'
type PlanningModel = 'destrezas' | 'competencias'

interface WizardState {
  profile: TeachingProfile | null
  // subject-first
  subjectName: string
  groups: string[]
  // classroom-first
  parallelName: string
  subjectNames: string[]
  // year
  yearName: string
  yearStart: string
  yearEnd: string
  // workspace
  workspaceName: string
  // students
  students: ParsedStudent[]
  // currículo — filtra qué competencias/destrezas se ofrecen luego al planificar
  subnivel: Subnivel | null
  planningModel: PlanningModel
}

const STEPS = ['Perfil', 'Currículo', 'Mis clases', 'Año escolar', 'Estudiantes', 'Tu aula']

const SUBNIVEL_OPTIONS: Array<{ value: Subnivel; label: string; hint: string }> = [
  { value: 'inicial', label: 'Inicial', hint: 'Maternal / 3 a 5 años' },
  { value: 'preparatoria', label: 'Preparatoria', hint: '1ro de Básica' },
  { value: 'elemental', label: 'Elemental', hint: '2do a 4to de Básica' },
  { value: 'media', label: 'Media', hint: '5to a 7mo de Básica' },
  { value: 'superior', label: 'Superior', hint: '8vo a 10mo de Básica' },
  { value: 'bgu', label: 'Bachillerato', hint: '1ro a 3ro BGU' },
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
    subjectName: '',
    groups: [''],
    parallelName: '',
    subjectNames: [''],
    yearName: `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    yearStart: `${new Date().getFullYear()}-09-01`,
    yearEnd: `${new Date().getFullYear() + 1}-07-31`,
    workspaceName: '',
    students: [],
    subnivel: null,
    planningModel: 'destrezas',
  })
  const setInstitution = useAuthStore((s) => s.setInstitution)

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
      subnivel: state.subnivel ?? undefined,
      planningModel: state.planningModel,
      ...(state.profile === 'subject-first'
        ? {
            subjectName: state.subjectName,
            groups: state.groups.filter(Boolean).map((name) => ({ name })),
          }
        : {
            parallelName: state.parallelName,
            subjectNames: state.subjectNames.filter(Boolean),
          }),
    }

    const setup = await setupMutation.mutateAsync(dto) as {
      yearId: string
      parallelIds: string[]
      subjectIds: string[]
      assignmentIds: string[]
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
    if (step === 0) return state.profile !== null
    if (step === 1) return state.subnivel !== null
    if (step === 2) {
      if (state.profile === 'subject-first') return state.subjectName.trim() && state.groups.some((g) => g.trim())
      return state.parallelName.trim() && state.subjectNames.some((s) => s.trim())
    }
    if (step === 3) return state.yearName.trim() && state.yearStart && state.yearEnd
    return true
  }

  const isLoading = setupMutation.isPending || bulkStudentsMutation.isPending

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-sm border p-8 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <StepIndicator current={step} total={STEPS.length} />
          <div>
            <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">
              Paso {step + 1} de {STEPS.length} — {STEPS[step]}
            </p>
            <h1 className="text-xl font-bold text-gray-900 mt-0.5">
              {step === 0 && `Hola, ${user?.fullName?.split(' ')[0] ?? 'profe'} 👋`}
              {step === 1 && 'Currículo que usas'}
              {step === 2 && 'Configura tus clases'}
              {step === 3 && 'Año escolar'}
              {step === 4 && 'Agrega a tus estudiantes'}
              {step === 5 && 'Personaliza tu aula'}
            </h1>
          </div>
        </div>

        {/* Step 0 — Perfil */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => set('profile', 'subject-first')}
              className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left ${
                state.profile === 'subject-first'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <BookOpen className={`w-8 h-8 ${state.profile === 'subject-first' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <p className="font-semibold text-sm text-gray-900">Profe de materia</p>
                <p className="text-xs text-gray-500 mt-0.5">Enseño Matemáticas, Inglés u otra materia a varios grupos</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => set('profile', 'classroom-first')}
              className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left ${
                state.profile === 'classroom-first'
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <School className={`w-8 h-8 ${state.profile === 'classroom-first' ? 'text-blue-600' : 'text-gray-400'}`} />
              <div>
                <p className="font-semibold text-sm text-gray-900">Profe de aula</p>
                <p className="text-xs text-gray-500 mt-0.5">Soy responsable de un grado y enseño varias materias</p>
              </div>
            </button>
          </div>
        )}

        {/* Step 1 — Currículo (subnivel + modelo de planificación) */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>¿En qué subnivel enseñas?</Label>
              <p className="text-xs text-gray-500">
                Con esto filtramos las competencias y destrezas oficiales que verás al planificar —
                para que luego solo tengas que elegir de una lista y generar con IA, sin buscar nada.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SUBNIVEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => set('subnivel', opt.value)}
                    className={`flex flex-col items-start gap-0.5 p-3 rounded-lg border-2 text-left transition-all ${
                      state.subnivel === opt.value
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

        {/* Step 2 — Clases */}
        {step === 2 && state.profile === 'subject-first' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>¿Qué materia enseñas?</Label>
              <Input
                placeholder="ej. Matemáticas"
                value={state.subjectName}
                onChange={(e) => set('subjectName', e.target.value)}
              />
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

        {step === 2 && state.profile === 'classroom-first' && (
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
              {state.subjectNames.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    placeholder={`ej. Matemáticas`}
                    value={s}
                    onChange={(e) => {
                      const next = [...state.subjectNames]
                      next[i] = e.target.value
                      set('subjectNames', next)
                    }}
                  />
                  {state.subjectNames.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-gray-400"
                      onClick={() => set('subjectNames', state.subjectNames.filter((_, j) => j !== i))}
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
                onClick={() => set('subjectNames', [...state.subjectNames, ''])}
              >
                <Plus className="w-4 h-4 mr-1" /> Agregar materia
              </Button>
            </div>
          </div>
        )}

        {/* Step 3 — Año escolar */}
        {step === 3 && (
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

        {/* Step 4 — Estudiantes */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Sube tu lista en Excel o agrega estudiantes manualmente desde el panel más tarde.
            </p>
            <ExcelStudentUpload onStudentsParsed={(students) => set('students', students)} />
          </div>
        )}

        {/* Step 5 — Workspace */}
        {step === 5 && (
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
            {step === 4 && (
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

            {step < STEPS.length - 1 ? (
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
