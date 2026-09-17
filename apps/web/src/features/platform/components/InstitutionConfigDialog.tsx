import * as React from 'react'
import { Plus, Edit2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import type { Institution } from '../api/platform.api'
import type { Subject } from '@/features/academic/api/academic.api'
import {
  useInstitutionAiConfig,
  useUpdateInstitutionAiConfig,
  useInstitutionSubjects,
  useCreateInstitutionSubject,
  useUpdateInstitutionSubject,
  useToggleInstitutionSubject,
  usePlatformCurriculumAreas,
  usePlatformCompetencyAreas,
} from '../hooks/usePlatform'

const NONE = '__none__'

interface InstitutionConfigDialogProps {
  institution: Institution | null
  onClose: () => void
}

/**
 * Config avanzada por institución que YA NO controla el admin de la
 * institución — asistente IA (activar, modelo, tope de tokens) y catálogo de
 * materias (crear/activar/desactivar). El admin de institución conserva solo
 * lectura de ambas cosas (ver GET /institution/ai-config y GET
 * /academic/subjects) para poder operar (asignar profesores, ver si la IA
 * está prendida) sin poder cambiarlas.
 */
export function InstitutionConfigDialog({ institution, onClose }: InstitutionConfigDialogProps) {
  return (
    <Dialog open={!!institution} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configuración avanzada — {institution?.name}</DialogTitle>
          <DialogDescription>
            Asistente IA y catálogo de materias — control exclusivo del superadministrador.
          </DialogDescription>
        </DialogHeader>
        {institution && (
          <div className="space-y-6 py-2">
            <AiConfigSection institutionId={institution.id} />
            <div className="border-t pt-6">
              <SubjectsSection institutionId={institution.id} />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AiConfigSection({ institutionId }: { institutionId: string }) {
  const { data } = useInstitutionAiConfig(institutionId)
  const update = useUpdateInstitutionAiConfig(institutionId)
  const [enabled, setEnabled] = React.useState(false)
  const [monthlyTokenCap, setMonthlyTokenCap] = React.useState(0)

  React.useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      setMonthlyTokenCap(data.monthlyTokenCap)
    }
  }, [data])

  if (!data) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Asistente IA de planificaciones</h3>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Habilitar asistente IA para esta institución
      </label>
      {enabled && (
        <div className="max-w-xs space-y-1.5">
          <Label>Tope mensual de tokens (0 = sin tope)</Label>
          <Input
            type="number"
            min={0}
            value={monthlyTokenCap}
            onChange={(e) => setMonthlyTokenCap(Number(e.target.value))}
          />
        </div>
      )}
      <Button
        size="sm"
        onClick={() => update.mutate({ enabled, monthlyTokenCap, model: data.model })}
        loading={update.isPending}
      >
        Guardar configuración de IA
      </Button>
    </div>
  )
}

const subjectDefaults = { name: '', code: '', isQualitative: false, curriculumAreaId: NONE, competencyAreaId: NONE }

function SubjectsSection({ institutionId }: { institutionId: string }) {
  const { data: subjects = [] } = useInstitutionSubjects(institutionId)
  const { data: curriculumAreas = [] } = usePlatformCurriculumAreas()
  const { data: competencyAreas = [] } = usePlatformCompetencyAreas()
  const createSubject = useCreateInstitutionSubject(institutionId)
  const updateSubject = useUpdateInstitutionSubject(institutionId)
  const toggleSubject = useToggleInstitutionSubject(institutionId)

  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Subject | null>(null)
  const [form, setForm] = React.useState(subjectDefaults)

  const openCreate = () => {
    setEditing(null)
    setForm(subjectDefaults)
    setFormOpen(true)
  }

  const openEdit = (subject: Subject) => {
    setEditing(subject)
    setForm({
      name: subject.name,
      code: subject.code,
      isQualitative: subject.isQualitative ?? false,
      curriculumAreaId: subject.curriculumAreaId ?? NONE,
      competencyAreaId: subject.competencyAreaId ?? NONE,
    })
    setFormOpen(true)
  }

  const submit = () => {
    const data = {
      name: form.name,
      code: form.code,
      isQualitative: form.isQualitative,
      curriculumAreaId: form.curriculumAreaId === NONE ? null : form.curriculumAreaId,
      competencyAreaId: form.competencyAreaId === NONE ? null : form.competencyAreaId,
    }
    if (editing) {
      updateSubject.mutate({ subjectId: editing.id, data }, { onSuccess: () => setFormOpen(false) })
    } else {
      createSubject.mutate(data, { onSuccess: () => setFormOpen(false) })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Materias</h3>
        <Button size="sm" variant="outline" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nueva materia
        </Button>
      </div>

      <div className="space-y-1.5">
        {subjects.length === 0 && <p className="text-xs text-slate-400">Sin materias registradas.</p>}
        {subjects.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">{s.name}</span>
              <span className="font-mono text-xs text-slate-400">{s.code}</span>
              <Badge variant={s.isActive ? 'success' : 'destructive'}>{s.isActive ? 'Activa' : 'Inactiva'}</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                loading={toggleSubject.isPending && toggleSubject.variables === s.id}
                onClick={() => toggleSubject.mutate(s.id)}
              >
                {s.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {formOpen && (
        <div className="space-y-3 rounded-md border bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-600">{editing ? 'Editar materia' : 'Nueva materia'}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="uppercase"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Área curricular (destrezas)</Label>
              <Select value={form.curriculumAreaId} onValueChange={(v) => setForm({ ...form, curriculumAreaId: v })}>
                <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ninguna</SelectItem>
                  {curriculumAreas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Área de competencias (CNC)</Label>
              <Select value={form.competencyAreaId} onValueChange={(v) => setForm({ ...form, competencyAreaId: v })}>
                <SelectTrigger><SelectValue placeholder="Ninguna" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ninguna</SelectItem>
                  {competencyAreas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="h-3.5 w-3.5"
              checked={form.isQualitative}
              onChange={(e) => setForm({ ...form, isQualitative: e.target.checked })}
            />
            Materia cualitativa
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={submit} loading={createSubject.isPending || updateSubject.isPending}>
              {editing ? 'Guardar cambios' : 'Crear materia'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
