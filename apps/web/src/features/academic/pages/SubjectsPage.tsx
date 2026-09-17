import { type ColumnDef } from '@tanstack/react-table'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { type Subject } from '../api/academic.api'
import { useSubjects } from '../hooks/useAcademic'

/**
 * Solo lectura — crear/editar/activar materias es control del superadministrador
 * de plataforma (ver /platform/institutions/:id/subjects), no del admin de esta
 * institución. Esta lista sigue existiendo porque el admin necesita ver qué
 * materias tiene disponibles para asignar profesores (CourseAssignment usa
 * este mismo catálogo).
 */
export function SubjectsPage() {
  const { data: subjects = [], isLoading } = useSubjects()

  const columns: ColumnDef<Subject, unknown>[] = [
    { accessorKey: 'name', header: 'Nombre' },
    {
      accessorKey: 'code',
      header: 'Código',
      cell: ({ row }) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{row.original.code}</span>
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
  ]

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Materias</h1>
        <p className="text-muted-foreground text-sm mt-1">
          El catálogo de materias lo gestiona el superadministrador de la plataforma — aquí solo puedes verlas para
          asignarlas a tus docentes.
        </p>
      </div>

      <DataTable
        columns={columns}
        data={subjects}
        emptyMessage="No hay materias registradas"
        emptyDescription="El superadministrador de la plataforma aún no ha creado materias para esta institución"
      />
    </div>
  )
}
