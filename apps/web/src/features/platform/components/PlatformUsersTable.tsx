import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { DataTable } from '@/shared/components/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { ROLE_LABELS, roleLabel } from '@/shared/lib/roles'
import { getErrorMessage } from '@/shared/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { platformApi, type PlatformUser, type PlatformUsersSort } from '../api/platform.api'
import { usePlatformRole } from '../hooks/usePlatform'

const USERS_PAGE_SIZE = 20

function formatRegisteredAt(date: string) {
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date))
}

export function PlatformUsersTable({ institutionId }: { institutionId: string }) {
  const { can } = usePlatformRole()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [role, setRole] = useState('all')
  const [sort, setSort] = useState<PlatformUsersSort>('name_asc')
  const { data: usersResult, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['platform-users', institutionId, search, role, sort, page],
    queryFn: () => platformApi.getPlatformUsers({
      institutionId,
      search: search || undefined,
      page,
      limit: USERS_PAGE_SIZE,
      role: role === 'all' ? undefined : role,
      sort,
    }),
  })

  const setAuth = useAuthStore((state) => state.setAuth)
  const { mutate: impersonate, isPending: isImpersonating } = useMutation({
    mutationFn: (userId: string) => platformApi.impersonateUser(userId),
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, {
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      })
      window.location.href = '/dashboard'
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const columns: ColumnDef<PlatformUser>[] = [
    { accessorKey: 'fullName', header: 'Usuario' },
    { accessorKey: 'email', header: 'Correo / identificador' },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.roles.map((userRole) => <Badge key={userRole} variant="secondary">{roleLabel(userRole)}</Badge>)}
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
      accessorKey: 'createdAt',
      header: 'Registrado',
      cell: ({ row }) => (
        <span className="text-sm text-slate-500">{formatRegisteredAt(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => can('impersonate') ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={isImpersonating}
          onClick={async () => {
            const confirmed = await confirmDialog({
              title: `¿Ingresar como ${row.original.fullName}?`,
              description: 'Verás la app exactamente como este usuario. La sesión dura 30 minutos y todo lo que hagas queda registrado en la auditoría.',
              confirmText: 'Ingresar',
            })
            if (confirmed) impersonate(row.original.id)
          }}
        >
          <LogIn className="mr-1.5 h-4 w-4" />
          Ingresar como
        </Button>
      ) : null,
    },
  ]

  const totalPages = usersResult
    ? Math.max(1, Math.ceil(usersResult.total / USERS_PAGE_SIZE))
    : 1

  if (isError) {
    return (
      <div className="space-y-3" role="alert">
        <p className="text-sm text-destructive">{getErrorMessage(error)}</p>
        <Button variant="outline" onClick={() => refetch()}>Reintentar</Button>
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-3">
      <DataTable
        columns={columns}
        data={usersResult?.data ?? []}
        isLoading={isLoading}
        searchPlaceholder="Buscar por nombre, correo o documento..."
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
        action={(
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={role} onValueChange={(value) => { setRole(value); setPage(1) }}>
              <SelectTrigger aria-label="Filtrar usuarios por rol" className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                <SelectItem value="staff">Personal (todos)</SelectItem>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => { setSort(value as PlatformUsersSort); setPage(1) }}>
              <SelectTrigger aria-label="Ordenar usuarios" className="sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Apellidos A–Z</SelectItem>
                <SelectItem value="name_desc">Apellidos Z–A</SelectItem>
                <SelectItem value="newest">Más recientes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        emptyMessage="Sin usuarios que coincidan con los filtros"
      />
      {usersResult && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span aria-live="polite">{usersResult.total} usuario{usersResult.total === 1 ? '' : 's'}{usersResult.total > USERS_PAGE_SIZE ? ` · Página ${page} de ${totalPages}` : ''}</span>
          {usersResult.total > USERS_PAGE_SIZE && <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Siguiente
            </Button>
          </div>}
        </div>
      )}
    </div>
  )
}
