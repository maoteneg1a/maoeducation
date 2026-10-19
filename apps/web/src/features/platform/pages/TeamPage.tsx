import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { DataTable } from '@/shared/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { formatDate } from '@/shared/lib/utils'
import { usePlatformAuthStore, type PlatformRole } from '@/store/platformAuth.store'
import { useCreateTeamMember, usePlatformRole, usePlatformTeam, useUpdateTeamMember } from '../hooks/usePlatform'
import type { PlatformTeamMember } from '../api/platform.api'

const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  owner: 'Dueño',
  support: 'Soporte',
  billing: 'Facturación',
}

const ROLE_DESCRIPTIONS: Record<PlatformRole, string> = {
  owner: 'Acceso total, incluido el equipo.',
  support: 'Notas, avisos, suplantación y leads.',
  billing: 'Suscripciones, pagos, límites y notas.',
}

const ROLES: PlatformRole[] = ['owner', 'support', 'billing']

export function TeamPage() {
  const { data: team = [], isLoading } = usePlatformTeam()
  const { isOwner } = usePlatformRole()
  const currentId = usePlatformAuthStore((s) => s.admin?.id)
  const updateMember = useUpdateTeamMember()
  const [createOpen, setCreateOpen] = useState(false)

  const toggleActive = async (m: PlatformTeamMember) => {
    if (m.isActive) {
      const ok = await confirmDialog({
        title: `¿Desactivar a ${m.name}?`,
        description: 'No podrá ingresar a la consola de plataforma hasta que lo reactives.',
        confirmText: 'Desactivar',
        destructive: true,
      })
      if (!ok) return
    }
    updateMember.mutate({ id: m.id, data: { isActive: !m.isActive } })
  }

  const columns: ColumnDef<PlatformTeamMember>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-800">
            {row.original.name}
            {row.original.id === currentId && <span className="ml-1.5 text-xs text-slate-400">(tú)</span>}
          </p>
          <p className="text-xs text-slate-500">{row.original.email}</p>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Rol',
      cell: ({ row }) =>
        isOwner && row.original.id !== currentId ? (
          <Select
            value={row.original.role}
            onValueChange={(role) => updateMember.mutate({ id: row.original.id, data: { role: role as PlatformRole } })}
          >
            <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Rol de ${row.original.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map((r) => (
                <SelectItem key={r} value={r} className="text-xs">{PLATFORM_ROLE_LABELS[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={row.original.role === 'owner' ? 'default' : 'secondary'}>
            {PLATFORM_ROLE_LABELS[row.original.role] ?? row.original.role}
          </Badge>
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
      accessorKey: 'lastLoginAt',
      header: 'Último ingreso',
      cell: ({ row }) => (
        <span className="text-sm text-slate-500">
          {row.original.lastLoginAt ? formatDate(row.original.lastLoginAt) : 'Nunca'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        isOwner && row.original.id !== currentId ? (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              loading={updateMember.isPending && updateMember.variables?.id === row.original.id}
              onClick={() => toggleActive(row.original)}
            >
              {row.original.isActive ? 'Desactivar' : 'Activar'}
            </Button>
          </div>
        ) : null,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Equipo de plataforma</h1>
        <p className="text-sm text-slate-500">Personas con acceso a esta consola y su rol</p>
      </div>

      <DataTable
        columns={columns}
        data={team}
        isLoading={isLoading}
        emptyMessage="Sin miembros"
        action={
          isOwner ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo miembro
            </Button>
          ) : undefined
        }
      />

      {isOwner && <CreateMemberDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}

function CreateMemberDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const createMember = useCreateTeamMember()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<PlatformRole>('support')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setEmail('')
    setPassword('')
    setRole('support')
    setError(null)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setError('Ingresa el nombre.')
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Email inválido.')
    if (password.length < 10) return setError('La contraseña debe tener al menos 10 caracteres.')
    setError(null)
    createMember.mutate(
      { name: name.trim(), email: email.trim(), password, role },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nuevo miembro del equipo</DialogTitle>
            <DialogDescription>Tendrá acceso a la consola de plataforma según su rol.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre</Label>
              <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-email">Email</Label>
              <Input id="team-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team-password">Contraseña inicial</Label>
              <Input id="team-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PlatformRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{PLATFORM_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={createMember.isPending}>Crear</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
