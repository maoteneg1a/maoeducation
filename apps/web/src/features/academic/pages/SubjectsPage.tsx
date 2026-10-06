import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Edit2, Plus, ToggleLeft, ToggleRight } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { DataTable } from '@/shared/components/ui/data-table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { useCurriculumAreas } from '@/features/curriculum/hooks/useCurriculum'
import { useCompetencyAreas } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { type Subject } from '../api/academic.api'
import { useCreateSubject, useSubjects, useToggleSubject, useUpdateSubject } from '../hooks/useAcademic'

const subjectSchema = z.object({
  name: z.string().trim().min(1, 'El nombre es requerido'),
  code: z.string().trim().max(20, 'Máximo 20 caracteres'),
  description: z.string().trim(),
  isQualitative: z.boolean(),
  curriculumAreaId: z.string(),
  competencyAreaId: z.string(),
  workloadCode: z.string(),
})
type SubjectForm = z.infer<typeof subjectSchema>
const NONE = '__none__'

export function SubjectsPage() {
  const { data: subjects = [], isLoading } = useSubjects()
  const createSubject = useCreateSubject()
  const updateSubject = useUpdateSubject()
  const toggleSubject = useToggleSubject()
  const { data: planningModel } = usePlanningModel()
  const { data: curriculumAreas = [] } = useCurriculumAreas()
  const { data: competencyAreas = [] } = useCompetencyAreas()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Subject | null>(null)
  const form = useForm<SubjectForm>({ resolver: zodResolver(subjectSchema), defaultValues: { name: '', code: '', description: '', isQualitative: false, curriculumAreaId: NONE, competencyAreaId: NONE, workloadCode: '' } })
  const usesCompetencies = planningModel === 'competencias'
  const catalogAreas = usesCompetencies ? competencyAreas : curriculumAreas
  const linkedAreaIds = new Set(subjects.flatMap((subject) => [subject.curriculumAreaId, subject.competencyAreaId].filter((id): id is string => !!id)))

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', code: '', description: '', isQualitative: false, curriculumAreaId: NONE, competencyAreaId: NONE, workloadCode: '' })
    setOpen(true)
  }

  function openEdit(subject: Subject) {
    setEditing(subject)
    form.reset({ name: subject.name, code: subject.code ?? '', description: subject.description ?? '', isQualitative: subject.isQualitative ?? false, curriculumAreaId: subject.curriculumAreaId ?? NONE, competencyAreaId: subject.competencyAreaId ?? NONE, workloadCode: subject.workloadCode ?? '' })
    setOpen(true)
  }

  function onSubmit(values: SubjectForm) {
    const data = { name: values.name, code: values.code || null, description: values.description || null, isQualitative: values.isQualitative, curriculumAreaId: values.curriculumAreaId === NONE ? null : values.curriculumAreaId, competencyAreaId: values.competencyAreaId === NONE ? null : values.competencyAreaId, workloadCode: values.workloadCode || null }
    if (editing) updateSubject.mutate({ id: editing.id, data }, { onSuccess: () => setOpen(false) })
    else createSubject.mutate(data, { onSuccess: () => setOpen(false) })
  }

  const columns: ColumnDef<Subject, unknown>[] = [
    { accessorKey: 'name', header: 'Nombre' },
    { accessorKey: 'code', header: 'Código', cell: ({ row }) => row.original.code ? <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{row.original.code}</span> : <span className="text-xs text-muted-foreground">—</span> },
    { id: 'tipo', header: 'Tipo', cell: ({ row }) => row.original.isQualitative ? <Badge variant="secondary">Cualitativa</Badge> : <span className="text-xs text-muted-foreground">Cuantitativa</span> },
    { accessorKey: 'isActive', header: 'Estado', cell: ({ row }) => <Badge variant={row.original.isActive ? 'success' : 'destructive'}>{row.original.isActive ? 'Activo' : 'Inactivo'}</Badge> },
    { id: 'actions', header: 'Acciones', cell: ({ row }) => <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)} aria-label="Editar materia"><Edit2 className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" onClick={() => toggleSubject.mutate(row.original.id)} loading={toggleSubject.isPending} aria-label="Cambiar estado">{row.original.isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4 text-muted-foreground" />}</Button>
    </div> },
  ]

  if (isLoading) return <PageLoader />

  return <div className="space-y-6 p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-2xl font-bold tracking-tight">Materias</h1><p className="mt-1 text-sm text-muted-foreground">Gestiona las materias propias de la institución y su vinculación académica.</p></div><Button onClick={openCreate}><Plus className="h-4 w-4" />Nueva materia</Button></div>
    <DataTable columns={columns} data={subjects} emptyMessage="No hay materias registradas" emptyDescription="Crea una materia para comenzar" />
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Editar materia' : 'Nueva materia'}</DialogTitle></DialogHeader>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label>Agregar desde el catálogo (opcional)</Label>
          <Select
            value={usesCompetencies ? form.watch('competencyAreaId') : form.watch('curriculumAreaId')}
            onValueChange={(areaId) => {
              const area = catalogAreas.find((item) => item.id === areaId)
              if (usesCompetencies) form.setValue('competencyAreaId', areaId)
              else form.setValue('curriculumAreaId', areaId)
              if (area) {
                form.setValue('name', area.name)
                form.setValue('code', area.code)
                form.setValue('workloadCode', area.code)
              }
            }}
          >
            <SelectTrigger><SelectValue placeholder="Seleccionar materia oficial" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Materia personalizada</SelectItem>
              {catalogAreas.filter((area) => !linkedAreaIds.has(area.id) || area.id === editing?.curriculumAreaId || area.id === editing?.competencyAreaId).map((area) => <SelectItem key={area.id} value={area.id}>{area.name} ({area.code})</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Las materias ya agregadas se ocultan para evitar duplicados. Al vincularla, el profesor recibe el contenido oficial y puede complementarlo desde su planificación.</p>
        </div>
        <div className="space-y-2"><Label htmlFor="subject-name">Nombre</Label><Input id="subject-name" {...form.register('name')} placeholder="Ej: Matemática" />{form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}</div>
        <div className="space-y-2"><Label htmlFor="subject-code">Código (opcional)</Label><Input id="subject-code" {...form.register('code')} placeholder="Ej: MAT" className="uppercase" onChange={(event) => form.setValue('code', event.target.value.toUpperCase())} />{form.formState.errors.code && <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>}</div>
        <div className="space-y-2"><Label htmlFor="subject-description">Descripción (opcional)</Label><textarea id="subject-description" {...form.register('description')} className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <label className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"><input type="checkbox" {...form.register('isQualitative')} className="h-4 w-4" /><span><span className="block font-medium">Materia cualitativa</span><span className="text-xs text-muted-foreground">Se muestra con equivalencias cualitativas y no entra en el promedio general.</span></span></label>
        <p className="text-xs text-muted-foreground">Una materia institucional puede existir sin vínculo curricular. El vínculo oficial, cuando corresponda, se conserva al editar.</p>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button type="submit" loading={createSubject.isPending || updateSubject.isPending}>{editing ? 'Guardar cambios' : 'Crear materia'}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
  </div>
}
