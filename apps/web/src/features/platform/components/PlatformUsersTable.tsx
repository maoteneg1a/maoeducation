import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { LogIn } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { DataTable } from '@/shared/components/ui/data-table'
import { getErrorMessage } from '@/shared/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { platformApi, type PlatformUser } from '../api/platform.api'
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
  const { data: usersResult, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['platform-users', institutionId, search, page],
    queryFn: () => platformApi.getPlatformUsers({
      institutionId,
      search: search || undefined,
      page,
      limit: USERS_PAGE_SIZE,
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
    { accessorKey: 'email', header: 'Email' },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => <span className="text-sm text-slate-500">{row.original.roles.join(', ')}</span>,
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
        searchPlaceholder="Buscar por nombre o email..."
        onSearch={(value) => {
          setSearch(value)
          setPage(1)
        }}
        emptyMessage="Sin usuarios"
      />
      {usersResult && usersResult.total > USERS_PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>Página {page} de {totalPages} · {usersResult.total} usuarios</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
