import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Edit2, FileSpreadsheet, Plus, UserIcon } from 'lucide-react'
import { BulkImportDialog, normalizeDni, pick } from '@/shared/components/import/BulkImportDialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { apiGet, apiPost, apiPut } from '@/shared/lib/api-client'
import { getErrorMessage } from '@/shared/lib/utils'

// ---- Interfaces ----

interface User {
  id: string
  fullName: string
  email: string
  dni?: string
  phone?: string
  roles: string[]
  isActive: boolean
}

interface CreateUserPayload {
  firstName: string
  lastName: string
  email: string
  password: string
  roleNames: string[]
  dni?: string
  phone?: string
}

interface UpdateUserPayload {
  firstName?: string
  lastName?: string
  dni?: string
  phone?: string
  isActive?: boolean
  password?: string
}

// ---- Hooks (inline) ----

const USERS_KEY = ['users']

function useUsers(search?: string, role?: string) {
  const params: Record<string, string> = {}
  if (search) params.search = search
  if (role && role !== 'all') params.role = role
  return useQuery({
    queryKey: [...USERS_KEY, params],
    queryFn: () =>
      apiGet<{ data: User[]; total: number }>('users', params).then((r) => r.data),
  })
}

function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserPayload) => apiPost<User>('users', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
      toast.success('Usuario creado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserPayload }) =>
      apiPut<User>(`users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: USERS_KEY })
      toast.success('Usuario actualizado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Constants ----

const ROLE_OPTIONS = ['admin', 'teacher', 'inspector', 'student', 'guardian'] as const

const roleVariant: Record<string, 'default' | 'secondary' | 'warning' | 'success' | 'destructive'> = {
  admin: 'destructive',
  teacher: 'default',
  inspector: 'warning',
  student: 'success',
  guardian: 'secondary',
}

const roleLabel: Record<string, string> = {
  admin: 'Admin',
  teacher: 'Docente',
  inspector: 'Inspector',
  student: 'Estudiante',
  guardian: 'Representante',
}

// ---- Schemas ----

const createUserSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  email: z.string().email('Email inválido'),
  // Opcional: si se deja vacía, la contraseña por defecto es la cédula.
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
  roleNames: z.array(z.string()).min(1, 'Selecciona al menos un rol'),
  dni: z.string().regex(/^\d{10}$/, 'La cédula debe tener 10 dígitos'),
  phone: z.string().optional(),
})
type CreateUserForm = z.infer<typeof createUserSchema>

const editUserSchema = z.object({
  firstName: z.string().min(1, 'El nombre es requerido'),
  lastName: z.string().min(1, 'El apellido es requerido'),
  dni: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean(),
  password: z.string().optional(),
})
type EditUserForm = z.infer<typeof editUserSchema>

// ---- Page Component ----

interface StaffImportRow {
  dni: string
  firstName: string
  lastName: string
  email?: string
  phone?: string
}

export function UsersPage() {
  const [search, setSearch] = React.useState('')
  const [roleFilter, setRoleFilter] = React.useState('all')
  const [debouncedSearch, setDebouncedSearch] = React.useState('')

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350)
    return () => clearTimeout(t)
  }, [search])

  const { data: users = [], isLoading } = useUsers(debouncedSearch, roleFilter)
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()

  const [createOpen, setCreateOpen] = React.useState(false)
  const [importOpen, setImportOpen] = React.useState(false)
  const [importRole, setImportRole] = React.useState<'teacher' | 'inspector' | 'dece'>('teacher')
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = React.useState(false)
  const [editingUser, setEditingUser] = React.useState<User | null>(null)

  const createForm = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      roleNames: [],
      dni: '',
      phone: '',
    },
  })

  const editForm = useForm<EditUserForm>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { firstName: '', lastName: '', dni: '', phone: '', isActive: true },
  })

  function openEdit(user: User) {
    setEditingUser(user)
    const parts = user.fullName.trim().split(' ')
    const mid = Math.ceil(parts.length / 2)
    editForm.reset({
      firstName: parts.slice(0, mid).join(' '),
      lastName: parts.slice(mid).join(' '),
      dni: user.dni ?? '',
      phone: user.phone ?? '',
      isActive: user.isActive,
    })
    setEditOpen(true)
  }

  function onCreateSubmit(values: CreateUserForm) {
    // La contraseña por defecto es la cédula: si no se escribe una, se envía
    // la cédula como contraseña.
    const data = { ...values, password: values.password?.trim() ? values.password : values.dni }
    createUser.mutate(data, {
      onSuccess: () => {
        setCreateOpen(false)
        createForm.reset()
      },
    })
  }

  function onEditSubmit(values: EditUserForm) {
    if (!editingUser) return
    // No enviar password vacío (significa "no cambiar")
    const data = { ...values }
    if (!data.password) delete data.password
    updateUser.mutate({ id: editingUser.id, data }, { onSuccess: () => setEditOpen(false) })
  }

  const watchedRoles = createForm.watch('roleNames')

  function toggleRole(role: string) {
    const current = createForm.getValues('roleNames')
    if (current.includes(role)) {
      createForm.setValue('roleNames', current.filter((r) => r !== role))
    } else {
      createForm.setValue('roleNames', [...current, role])
    }
  }

  const columns: ColumnDef<User, unknown>[] = [
    {
      accessorKey: 'fullName',
      header: 'Nombre',
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <UserIcon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm leading-none">{row.original.fullName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'roles',
      header: 'Roles',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((r) => (
            <Badge key={r} variant={roleVariant[r] ?? 'secondary'}>
              {roleLabel[r] ?? r}
            </Badge>
          ))}
        </div>
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
        <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
          <Edit2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  if (isLoading && !debouncedSearch && roleFilter === 'all') return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestiona los usuarios del sistema</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            Importar personal
          </Button>
          <Button
            onClick={() => {
              createForm.reset()
              setCreateOpen(true)
            }}
          >
            <Plus className="h-4 w-4" />
            Nuevo Usuario
          </Button>
        </div>
      </div>

      <BulkImportDialog<StaffImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importar personal desde Excel"
        description="Una fila por persona. La contraseña inicial es su cédula (igual que el alta individual). Si no hay correo, se usa la cédula para ingresar."
        templateRow={{ cedula: '0102030405', nombres: 'María José', apellidos: 'Pérez López', correo: 'maria.perez@escuela.edu', telefono: '0991234567' }}
        templateFileName="plantilla_importacion_personal.xlsx"
        maxRows={300}
        mapRow={(e) => ({
          dni: normalizeDni(pick(e, 'cedula', 'dni')),
          firstName: String(pick(e, 'nombres', 'nombre')),
          lastName: String(pick(e, 'apellidos', 'apellido')),
          email: String(pick(e, 'correo', 'email', 'correo_electronico')) || undefined,
          phone: String(pick(e, 'telefono', 'celular', 'phone')) || undefined,
        })}
        previewLabel={(r) => `${r.dni} · ${r.firstName} ${r.lastName}${r.email ? ` · ${r.email}` : ''}`}
        onSubmit={async (rows) => {
          const res = await apiPost<{ created: number; skipped: number; results: Array<{ dni: string; fullName: string; status: string; reason?: string }> }>(
            'users/bulk',
            { roleName: importRole, users: rows },
            { timeout: 300_000 },
          )
          qc.invalidateQueries({ queryKey: USERS_KEY })
          return {
            summary: `${res.created} creados · ${res.skipped} omitidos`,
            results: res.results.map((r) => ({ label: `${r.dni} · ${r.fullName}`, status: r.status, reason: r.reason })),
          }
        }}
      >
        <div className="flex items-center gap-2 text-sm">
          <span>Rol:</span>
          <Select value={importRole} onValueChange={(v) => setImportRole(v as typeof importRole)}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="teacher">Docente</SelectItem>
              <SelectItem value="inspector">Inspector/a</SelectItem>
              <SelectItem value="dece">DECE</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </BulkImportDialog>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <Input
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm"
        />
        <div className="w-full sm:w-52">
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los roles</SelectItem>
              {ROLE_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {roleLabel[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={users}
        isLoading={isLoading}
        emptyMessage="No se encontraron usuarios"
        emptyDescription="Intenta ajustar los filtros o crea un nuevo usuario"
      />

      {/* ---- Create Dialog ---- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input {...createForm.register('firstName')} placeholder="Juan" />
                {createForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Apellido</Label>
                <Input {...createForm.register('lastName')} placeholder="Pérez" />
                {createForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive">
                    {createForm.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                {...createForm.register('email')}
                type="email"
                placeholder="juan@ejemplo.com"
              />
              {createForm.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Contraseña</Label>
              <Input
                {...createForm.register('password')}
                type="password"
                placeholder="Por defecto: la cédula"
              />
              <p className="text-xs text-muted-foreground">
                Si la dejas vacía, la contraseña inicial será la cédula.
              </p>
              {createForm.formState.errors.password && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.password.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Roles</Label>
              <div className="flex flex-wrap gap-2 p-2 border rounded-md">
                {ROLE_OPTIONS.map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => toggleRole(role)}
                    className={`px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                      watchedRoles.includes(role)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-foreground border-input hover:bg-muted'
                    }`}
                  >
                    {roleLabel[role]}
                  </button>
                ))}
              </div>
              {createForm.formState.errors.roleNames && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.roleNames.message}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cédula / DNI *</Label>
                <Input {...createForm.register('dni')} placeholder="10 dígitos" inputMode="numeric" maxLength={10} />
                {createForm.formState.errors.dni && (
                  <p className="text-xs text-destructive">{createForm.formState.errors.dni.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input {...createForm.register('phone')} placeholder="Opcional" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={createUser.isPending}>
                Crear usuario
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---- Edit Dialog ---- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input {...editForm.register('firstName')} />
                {editForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive">
                    {editForm.formState.errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Apellido</Label>
                <Input {...editForm.register('lastName')} />
                {editForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive">
                    {editForm.formState.errors.lastName.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cédula / DNI</Label>
                <Input {...editForm.register('dni')} />
              </div>
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input {...editForm.register('phone')} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nueva contraseña</Label>
              <Input
                type="text"
                {...editForm.register('password')}
                placeholder="Dejar vacío para no cambiar"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="isActive"
                {...editForm.register('isActive')}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <Label htmlFor="isActive">Usuario activo</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={updateUser.isPending}>
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
