import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { ArrowLeft, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  useCreateInstitutionAdmin,
  useInstitutionAdmins,
  useUpdateInstitutionAdmin,
} from '../hooks/usePlatform'
import type { InstitutionAdmin } from '../api/platform.api'

const schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  password: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

export function InstitutionAdminsPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: admins = [], isLoading } = useInstitutionAdmins(id)
  const createAdmin = useCreateInstitutionAdmin(id)
  const updateAdmin = useUpdateInstitutionAdmin(id)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InstitutionAdmin | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const openCreate = () => {
    setEditing(null)
    reset({ firstName: '', lastName: '', email: '', password: '' })
    setDialogOpen(true)
  }

  const openEdit = (admin: InstitutionAdmin) => {
    setEditing(admin)
    reset({ firstName: admin.firstName, lastName: admin.lastName, email: admin.email, password: '' })
    setDialogOpen(true)
  }

  const onSubmit = (values: FormValues) => {
    if (editing) {
      updateAdmin.mutate(
        {
          userId: editing.id,
          data: {
            firstName: values.firstName,
            lastName: values.lastName,
            email: values.email,
            ...(values.password ? { password: values.password } : {}),
          },
        },
        { onSuccess: () => setDialogOpen(false) },
      )
    } else {
      if (!values.password || values.password.length < 8) return
      createAdmin.mutate(
        {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email,
          password: values.password,
        },
        { onSuccess: () => setDialogOpen(false) },
      )
    }
  }

  const columns: ColumnDef<InstitutionAdmin>[] = [
    {
      id: 'name',
      header: 'Nombre',
      cell: ({ row }) => `${row.original.lastName} ${row.original.firstName}`,
    },
    { accessorKey: 'email', header: 'Email' },
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
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(row.original)}>
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={updateAdmin.isPending && updateAdmin.variables?.userId === row.original.id}
            onClick={() =>
              updateAdmin.mutate({ userId: row.original.id, data: { isActive: !row.original.isActive } })
            }
          >
            {row.original.isActive ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate('/platform')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Instituciones
        </Button>
        <h1 className="text-2xl font-bold text-slate-900">Administradores</h1>
        <p className="text-sm text-slate-500">Gestiona los usuarios admin de esta institución</p>
      </div>

      <DataTable
        columns={columns}
        data={admins}
        isLoading={isLoading}
        emptyMessage="Sin administradores"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo admin
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{editing ? 'Editar administrador' : 'Nuevo administrador'}</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Deja la contraseña vacía para no cambiarla.'
                  : 'Se creará con el rol admin de la institución.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">Nombre</Label>
                  <Input id="firstName" {...register('firstName')} />
                  {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Apellido</Label>
                  <Input id="lastName" {...register('lastName')} />
                  {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</Label>
                <Input id="password" type="password" placeholder="Mínimo 8 caracteres" {...register('password')} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={createAdmin.isPending || updateAdmin.isPending}>
                {editing ? 'Guardar' : 'Crear admin'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
