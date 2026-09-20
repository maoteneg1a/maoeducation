import * as React from 'react'
import { Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { useAiEnabled, useAiBudgetUsage } from '../hooks/useAiAssistant'

const STORAGE_KEY = 'ai-token-tip-seen'

// Costo aproximado de una generación exitosa de una semana — promedio real
// medido en producción (input+output de ai.draft_competency_week), usado
// solo para mostrarle al docente una idea de cuántas planificaciones más
// alcanza el cupo restante. No es exacto (varía por competencia/saberes),
// es una estimación orientativa.
const AVG_TOKENS_PER_WEEK = 7500

/**
 * Modal educativo que aparece UNA VEZ (por navegador, vía localStorage) al
 * entrar a planificación — explica que cada reintento de la IA consume
 * tokens de nuevo (facturado completo otra vez) y qué puede hacer el docente
 * para que la IA acierte a la primera: elegir bien pocas competencias/
 * destrezas concretas en vez de todas a la vez. Nace del incidente real de
 * gasto acelerado de tokens (~20% de llamadas necesitaban reintento) — parte
 * de la causa es el docente seleccionando de más o cambiando de opinión
 * varias veces antes de generar.
 */
export function AiTokenTipModal() {
  const aiEnabled = useAiEnabled()
  const { data: usage } = useAiBudgetUsage()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!aiEnabled) return
    if (localStorage.getItem(STORAGE_KEY) === '1') return
    setOpen(true)
  }, [aiEnabled])

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setOpen(false)
  }

  const remainingToday = usage && usage.dailyTokenCap > 0 ? Math.max(0, usage.dailyTokenCap - usage.usedToday) : null
  const remainingWeeks = remainingToday !== null ? Math.floor(remainingToday / AVG_TOKENS_PER_WEEK) : null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Antes de generar con IA
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-3 text-sm text-foreground">
              <p>
                Cada vez que la IA genera una semana <strong>consume tokens</strong> — y si tu selección es
                ambigua o cambia varias veces, la IA puede necesitar <strong>reintentar</strong>, lo que{' '}
                <strong>consume el doble</strong> (se factura la generación completa de nuevo).
              </p>
              <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
                <p className="font-medium">Para que la IA acierte a la primera:</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  <li>Elige pocas competencias/destrezas concretas para la semana — no todas a la vez.</li>
                  <li>Revisa que los saberes seleccionados correspondan realmente al grado y período.</li>
                  <li>Define la selección antes de generar, en vez de generar y luego cambiar la selección.</li>
                </ul>
              </div>
              {remainingWeeks !== null && (
                <p className="text-muted-foreground">
                  Tu institución tiene cupo hoy para generar aproximadamente{' '}
                  <strong className="text-foreground">{remainingWeeks} semana(s) más</strong> con IA. El cupo se
                  renueva todos los días.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={handleClose}>
            Entendido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
