import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Edit2, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { type Subject } from '../api/academic.api'
import { useSubjects, useCreateSubject, useUpdateSubject } from '../hooks/useAcademic'
import { useCurriculumAreas } from '@/features/curriculum/hooks/useCurriculum'
import { useCompetencyAreas } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'

const NONE = '__none__'

const subjectSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  code: z.string().min(1, 'El código es requerido'),
  isQualitative: z.boolean().default(false),
  curriculumAreaId: z.string().default(NONE),
  competencyAreaId: z.string().default(NONE),
})
type SubjectForm = z.infer<typeof subjectSchema>

export function SubjectsPage() {
  const { data: subjects = [], isLoading } = useSubjects()
  const createSubject = useCreateSubject()
  const updateSubject = useUpdateSubject()
  const { data: planningModel } = usePlanningModel()
  const { data: curriculumAreas = [] } = useCurriculumAreas()
  const { data: competencyAreas = [] } = useCompetencyAreas()
  const isCompetencyModel = planningModel === 'competencias'

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Subject | null>(null)

  const form = useForm<SubjectForm>({
    resolver: zodResolver(subjectSchema),
    defaultValues: { name: '', code: '', isQualitative: false, curriculumAreaId: NONE, competencyAreaId: NONE },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', code: '', isQualitative: false, curriculumAreaId: NONE, competencyAreaId: NONE })
    setOpen(true)
  }

  function openEdit(subject: Subject) {
    setEditing(subject)
    form.reset({
      name: subject.name,
      code: subject.code,
      isQualitative: subject.isQualitative ?? false,
      curriculumAreaId: subject.curriculumAreaId ?? NONE,
      competencyAreaId: subject.competencyAreaId ?? NONE,
    })
    setOpen(true)
  }

  function onSubmit(values: SubjectForm) {
    const data = {
      ...values,
      curriculumAreaId: values.curriculumAreaId === NONE ? null : values.curriculumAreaId,
      competencyAreaId: values.competencyAreaId === NONE ? null : values.competencyAreaId,
    }
    if (editing) {
      updateSubject.mutate(
        { id: editing.id, data },
        { onSuccess: () => setOpen(false) },
      )
    } else {
      createSubject.mutate(data, { onSuccess: () => setOpen(false) })
    }
  }

  const columns: ColumnDef<Subject, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
    },
    {
      accessorKey: 'code',
      header: 'Código',
      cell: ({ row }) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {row.original.code}
        </span>
      ),
    },
    {
      id: 'tipo',
      header: 'Tipo',
      cell: ({ row }) =>
        row.original.isQualitative ? (
          <Badge variant="secondary">Cualitativa</Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Cuantitativa</span>
        ),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'destructive'}>
          {row.original.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => openEdit(row.original)}
        >
          <Edit2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Materias</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona las materias del currículo institucional
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nueva Materia
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={subjects}
        emptyMessage="No hay materias registradas"
        emptyDescription="Crea una materia para comenzar"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Materia' : 'Nueva Materia'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...form.register('name')} placeholder="Ej: Matemáticas" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                {...form.register('code')}
                placeholder="Ej: MAT"
                className="uppercase"
                onChange={(e) => form.setValue('code', e.target.value.toUpperCase())}
              />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Área {isCompetencyModel ? 'de competencias (CNC)' : 'curricular (Currículo Priorizado)'}</Label>
              <Select
                value={isCompetencyModel ? form.watch('competencyAreaId') : form.watch('curriculumAreaId')}
                onValueChange={(v) =>
                  isCompetencyModel ? form.setValue('competencyAreaId', v) : form.setValue('curriculumAreaId', v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Ninguna</SelectItem>
                  {(isCompetencyModel ? competencyAreas : curriculumAreas).map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Vincula esta materia al banco {isCompetencyModel ? 'de competencias' : 'de destrezas'} para habilitar
                su selector en la planificación semanal.
              </p>
            </div>
            <label className="flex items-start gap-2 rounded-md border border-input p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={form.watch('isQualitative')}
                onChange={(e) => form.setValue('isQualitative', e.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium">Materia cualitativa</span>
                <span className="block text-xs text-muted-foreground">
                  Se califica con notas, pero en la libreta se muestra como letra (A+…F−) y no entra en el promedio general.
                </span>
              </span>
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={createSubject.isPending || updateSubject.isPending}
              >
                {editing ? 'Guardar cambios' : 'Crear materia'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
