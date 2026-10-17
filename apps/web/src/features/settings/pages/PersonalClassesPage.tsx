import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/shared/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useCurriculumAreas } from '@/features/curriculum/hooks/useCurriculum'
import { useCompetencyAreas } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { GRADE_OPTIONS, MULTIGRADE_GRADE_OPTIONS } from '@/features/personal/lib/grade-options'
import { usePersonalClasses, useSavePersonalClasses, useUpdatePlanningModel } from '@/features/personal/hooks/usePersonalClasses'
import type { PersonalClassSelection } from '@/features/personal/api/personal.api'

interface EditableRow {
  key: string
  gradeCode: string
  subjectAreaId: string
  subjectId?: string
  subjectName?: string
  customSubjectName?: string
  customGradeName?: string
  courseAssignmentId?: string
  hasDependentData?: boolean
  weeklyPeriodsOverride: number | null
  needsWeeklyPeriodsOverride: boolean
}

let rowSeq = 0
function newRowKey() {
  return `new-${++rowSeq}`
}

export function PersonalClassesPage() {
  const { data, isLoading } = usePersonalClasses()
  const save = useSavePersonalClasses()
  const updatePlanningModel = useUpdatePlanningModel()
  const setInstitution = useAuthStore((s) => s.setInstitution)

  const [rows, setRows] = useState<EditableRow[]>([])
  const [multigradeEnabled, setMultigradeEnabled] = useState(false)
  const [allowSuperiorExtension, setAllowSuperiorExtension] = useState(false)

  useEffect(() => {
    if (!data) return
    setRows(
      data.rows.map((r) => ({
        key: r.courseAssignmentId,
        gradeCode: r.gradeCode,
        subjectAreaId: r.subjectAreaId ?? (r.isCustomSubject ? '__custom__' : `existing-${r.subjectId}`),
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        customSubjectName: r.isCustomSubject ? r.subjectName : undefined,
        courseAssignmentId: r.courseAssignmentId,
        hasDependentData: r.hasDependentData,
        weeklyPeriodsOverride: r.weeklyPeriodsOverride,
        needsWeeklyPeriodsOverride: r.needsWeeklyPeriodsOverride,
      })),
    )
    setMultigradeEnabled(data.multigradeEnabled)
    setAllowSuperiorExtension(data.allowSuperiorExtension)
  }, [data])

  const { data: curriculumAreas = [] } = useCurriculumAreas()
  const { data: competencyAreas = [] } = useCompetencyAreas()
  const catalogAreas = data?.planningModel === 'competencias' ? competencyAreas : curriculumAreas

  if (isLoading || !data) return <PageLoader />

  const egbRows = rows.filter((r) => MULTIGRADE_GRADE_OPTIONS.some((g) => g.value === r.gradeCode))
  const hasSuperiorGradeSelected = egbRows.some(
    (r) => MULTIGRADE_GRADE_OPTIONS.find((g) => g.value === r.gradeCode)?.superior,
  )
  const multigradeReady = !multigradeEnabled || egbRows.length >= 2

  function setRow(key: string, patch: Partial<EditableRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows((rs) => [
      ...rs,
      { key: newRowKey(), gradeCode: '', subjectAreaId: '', weeklyPeriodsOverride: null, needsWeeklyPeriodsOverride: false },
    ])
  }

  function removeRow(key: string) {
    setRows((rs) => rs.filter((r) => r.key !== key))
  }

  async function handleSave() {
    if (rows.some((r) => !r.gradeCode || (r.gradeCode === '__custom__' && !r.customGradeName?.trim()) ||
      (!r.subjectId && (r.subjectAreaId === '__custom__' ? !r.customSubjectName?.trim() : !r.subjectAreaId)))) {
      toast.error('Completa el grado y la materia de cada fila antes de guardar')
      return
    }
    const selections: PersonalClassSelection[] = rows.map((r) => ({
      gradeCode: r.gradeCode,
      customGradeName: r.gradeCode === '__custom__' ? r.customGradeName?.trim() : undefined,
      subjectId: r.subjectId,
      subjectAreaId: r.subjectAreaId !== '__custom__' ? r.subjectAreaId : undefined,
      customSubjectName: !r.subjectId && r.subjectAreaId === '__custom__' ? r.customSubjectName?.trim() : undefined,
      weeklyPeriodsOverride: r.weeklyPeriodsOverride,
    }))

    if (selections.length === 0) {
      toast.error('Agrega al menos un grado con materia')
      return
    }
    if (multigradeEnabled) {
      const egbSelections = selections.filter((s) => MULTIGRADE_GRADE_OPTIONS.some((g) => g.value === s.gradeCode))
      if (egbSelections.length < 2) {
        toast.error('El modo multigrado necesita al menos 2 grados de Básica (BGU se planifica por separado)')
        return
      }
      const hasSuperior = egbSelections.some(
        (s) => MULTIGRADE_GRADE_OPTIONS.find((g) => g.value === s.gradeCode)?.superior,
      )
      if (hasSuperior && !allowSuperiorExtension) {
        toast.error('Confirma la extensión superior para incluir grados de 8vo a 10mo de Básica')
        return
      }
    }

    try {
      const result = await save.mutateAsync({ selections, multigradeEnabled, allowSuperiorExtension })
      if (result.blocked.length > 0) {
        toast.warning(
          `No se pudo quitar: ${result.blocked.map((b) => `${b.gradeCode} - ${b.subjectName}`).join(', ')} (ya tiene datos registrados)`,
        )
      } else {
        toast.success('Grados y materias actualizados')
      }
      const institution = useAuthStore.getState().user?.institution
      if (institution) setInstitution({ ...institution, multigradeEnabled })
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Mis grados y materias</h1>
        <p className="text-sm text-muted-foreground">
          Corrige o amplía los grados y materias que dictas. Los cambios se aplican de inmediato a tu planificación.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Año lectivo: {data.yearName}</CardTitle>
          <CardDescription>
            Configura años y períodos con los nombres y fechas de tu país. Los grados y materias de abajo corresponden al año activo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild><Link to="/academic/years">Gestionar años lectivos y períodos</Link></Button>
            <Button variant="outline" asChild><Link to="/settings/calificacion">Configurar porcentajes de calificación</Link></Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modelo de planificación</CardTitle>
          <CardDescription>
            Define qué banco curricular usas: por Destrezas (currículo tradicional) o por Competencias (CNC). Cambiarlo
            afecta el catálogo de materias disponible abajo — si ya tienes grados/materias configurados con el modelo
            anterior, revísalos después de cambiar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <select
            value={data?.planningModel ?? 'competencias'}
            onChange={(e) => updatePlanningModel.mutate(e.target.value as 'destrezas' | 'competencias')}
            disabled={updatePlanningModel.isPending}
            className="h-9 rounded-md border border-gray-200 px-2 text-sm text-gray-700"
          >
            <option value="competencias">Por Competencias (CNC)</option>
            <option value="destrezas">Por Destrezas</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grados y materias</CardTitle>
          <CardDescription>
            Elige del catálogo oficial o escribe grados y materias personalizados para tu país. Las materias personalizadas quedan fuera de la malla curricular.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => (
            <div key={row.key} className="space-y-1">
              <div className="flex gap-2 items-start">
                <select
                  aria-label="Grado"
                  value={row.gradeCode}
                  onChange={(e) => setRow(row.key, { gradeCode: e.target.value })}
                  className="flex-1 min-w-0 h-9 rounded-md border border-gray-200 px-2 text-sm text-gray-700"
                >
                  <option value="">Grado…</option>
                  <option value="__custom__">Grado personalizado…</option>
                  {data.rows.filter((r, i, all) => !GRADE_OPTIONS.some((g) => g.value === r.gradeCode) && all.findIndex((a) => a.gradeCode === r.gradeCode) === i).map((r) => (
                    <option key={r.gradeCode} value={r.gradeCode}>{r.gradeName}</option>
                  ))}
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Materia"
                  value={row.subjectAreaId}
                  onChange={(e) => setRow(row.key, { subjectAreaId: e.target.value, subjectId: undefined, needsWeeklyPeriodsOverride: false })}
                  className="flex-1 min-w-0 h-9 rounded-md border border-gray-200 px-2 text-sm text-gray-700"
                >
                  <option value="">Materia…</option>
                  <option value="__custom__">Materia personalizada (fuera de la malla)…</option>
                  {row.subjectId && row.subjectAreaId && row.subjectAreaId !== '__custom__' && !catalogAreas.some((a) => a.id === row.subjectAreaId) && (
                    <option value={row.subjectAreaId}>{row.subjectName}</option>
                  )}
                  {catalogAreas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-gray-400"
                  onClick={() => removeRow(row.key)}
                  title={row.hasDependentData ? 'Ya tiene actividades/notas registradas' : undefined}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {row.gradeCode === '__custom__' && (
                <Input aria-label="Nombre del grado personalizado" maxLength={100} placeholder="Ej: Séptimo de primaria, Grade 8" value={row.customGradeName ?? ''}
                  onChange={(e) => setRow(row.key, { customGradeName: e.target.value })} />
              )}
              {row.subjectAreaId === '__custom__' && (
                <div className="space-y-1">
                  <Input aria-label="Nombre de la materia personalizada" maxLength={150} placeholder="Ej: Robótica, Historia de Colombia" value={row.customSubjectName ?? ''}
                    onChange={(e) => setRow(row.key, { customSubjectName: e.target.value, subjectId: undefined })} />
                  <p className="text-xs text-muted-foreground">Fuera de la malla curricular. Puedes registrar actividades y calificaciones sin un área oficial.</p>
                </div>
              )}
              {row.needsWeeklyPeriodsOverride && (
                <div className="flex items-center gap-2 pl-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-xs text-gray-500">
                    Esta materia comparte horas con otras — indica cuántas clases a la semana tienes tú:
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={row.weeklyPeriodsOverride ?? ''}
                    onChange={(e) =>
                      setRow(row.key, { weeklyPeriodsOverride: e.target.value ? Number(e.target.value) : null })
                    }
                    className="w-16 h-8 rounded-md border border-gray-200 px-2 text-sm text-gray-700"
                    placeholder="ej. 3"
                  />
                  <span className="text-xs text-gray-400">clases/semana</span>
                </div>
              )}
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 px-0" onClick={addRow}>
            <Plus className="w-4 h-4 mr-1" /> Agregar grado + materia
          </Button>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            Si quitas un grado+materia que ya tiene actividades, notas o planificación registrada, no se borrará
            automáticamente — te avisaremos al guardar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Modo multigrado</CardTitle>
          <CardDescription>
            Actívalo si dictas varios grados de Básica a la vez (unidocente/pluridocente). BGU siempre se planifica
            por separado, aunque el modo esté activo. Los grados personalizados quedan fuera del grupo multigrado oficial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={multigradeEnabled}
              onChange={(e) => setMultigradeEnabled(e.target.checked)}
            />
            <span className="text-sm font-medium text-gray-900">Planifico en modo multigrado</span>
          </label>
          {multigradeEnabled && !multigradeReady && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Necesitas al menos 2 grados de Básica (no BGU) en la lista de arriba para activar multigrado.
            </p>
          )}
          {multigradeEnabled && hasSuperiorGradeSelected && (
            <label className="flex items-start gap-2 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={allowSuperiorExtension}
                onChange={(e) => setAllowSuperiorExtension(e.target.checked)}
              />
              <span>
                Confirmo la <strong>extensión superior</strong>: incluyo grados de 8vo a 10mo de Básica en mi aula
                multigrado.
              </span>
            </label>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  )
}
