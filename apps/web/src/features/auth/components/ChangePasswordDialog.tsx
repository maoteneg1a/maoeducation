import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/shared/components/ui/dialog'
import { apiPost } from '@/shared/lib/api-client'
import { getErrorMessage } from '@/shared/lib/utils'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  const reset = () => { setCurrent(''); setNext(''); setConfirm('') }

  const mutation = useMutation({
    mutationFn: () => apiPost<void>('auth/change-password', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('Contraseña cambiada correctamente')
      reset()
      onOpenChange(false)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const canSubmit = current.length >= 1 && next.length >= 6 && next === confirm

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>Ingresa tu contraseña actual y la nueva.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="current">Contraseña actual</Label>
            <Input id="current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="next">Nueva contraseña</Label>
            <Input id="next" type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="Mínimo 6 caracteres" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirmar nueva contraseña</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            {confirm.length > 0 && next !== confirm && (
              <p className="text-xs text-destructive">Las contraseñas no coinciden</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!canSubmit}>
            Cambiar contraseña
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
