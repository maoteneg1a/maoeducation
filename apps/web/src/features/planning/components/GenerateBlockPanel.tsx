import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useAiEnabled, useDraftSituationBlock } from '@/features/ai-assistant/hooks/useAiAssistant'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { SkillAndSaberSelector } from './SkillAndSaberSelector'
import { CompetencyAndSaberSelector } from './CompetencyAndSaberSelector'

interface GenerateBlockPanelProps {
  situationId: string
  subjectId: string | undefined
  subnivel: string | undefined
  /**
   * Competencias ya elegidas al crear la situación. Si vienen, el panel no
   * vuelve a preguntarlas — antes el docente tenía que seleccionar la misma
   * competencia dos veces. Vacío en situaciones creadas antes de que se
   * guardara la competencia, y en el modelo por destrezas.
   */
  situationCompetencyIds?: string[]
}

/**
 * Estilo TIGA: el docente elige la destreza/competencia UNA sola vez junto con
 * cuántas semanas dura el bloque, y la IA genera y guarda las N PlanningWeek
 * de un solo golpe — sin entrar semana por semana a pedir el borrador. Se
 * ofrece siempre junto al botón "Agregar semana" manual (no lo reemplaza),
 * para cuando el docente necesite ampliar el bloque después.
 */
export function GenerateBlockPanel({
  situationId,
  subjectId,
  subnivel,
  situationCompetencyIds = [],
}: GenerateBlockPanelProps) {
  const qc = useQueryClient()
  const aiEnabled = useAiEnabled()
  const { data: planningModel } = usePlanningModel()
  const isCompetencyModel = planningModel === 'competencias'
  const draftBlock = useDraftSituationBlock()

  const [open, setOpen] = React.useState(false)
  const [skillIds, setSkillIds] = React.useState<string[]>([])
  const [competencyIds, setCompetencyIds] = React.useState<string[]>([])
  const [saberIds, setSaberIds] = React.useState<string[]>([]) // no se usa al generar, solo para satisfacer el selector
  const [weeksCount, setWeeksCount] = React.useState('6')

  // La competencia ya viene definida desde la creación de la situación: no se
  // vuelve a pedir y el panel queda reducido a "cuántas semanas".
  const usesSituationCompetencies = isCompetencyModel && situationCompetencyIds.length > 0
  const effectiveCompetencyIds = usesSituationCompetencies ? situationCompetencyIds : competencyIds

  const selectedCount = isCompetencyModel ? effectiveCompetencyIds.length : skillIds.length

  const handleGenerate = () => {
    draftBlock.mutate(
      {
        situationId,
        weeksCount: Number(weeksCount) || 1,
        skillIds: isCompetencyModel ? undefined : skillIds,
        competencyIds: isCompetencyModel ? effectiveCompetencyIds : undefined,
      },
      {
        onSuccess: (result) => {
          qc.invalidateQueries({ queryKey: ['planning-weeks', situationId] })
          setOpen(false)
          setSkillIds([])
          setCompetencyIds([])
          void result
        },
      },
    )
  }

  if (!aiEnabled) return null

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <Sparkles className="h-4 w-4" />
        Generar bloque de semanas con IA
      </Button>
    )
  }

  return (
    <Card className="space-y-4 border-primary/30 bg-primary/5 p-4">
      <div>
        <p className="text-sm font-medium text-primary">Generar bloque completo con IA</p>
        <p className="text-xs text-muted-foreground">
          {usesSituationCompetencies
            ? 'Indica cuántas semanas dura este bloque — se crean y llenan todas automáticamente con la competencia de esta situación.'
            : `Elige ${isCompetencyModel ? 'la(s) competencia(s)' : 'la(s) destreza(s)'} y cuántas semanas dura este bloque — se crean y llenan todas las semanas automáticamente, sin entrar una por una.`}
        </p>
      </div>

      {usesSituationCompetencies ? null : isCompetencyModel ? (
        <CompetencyAndSaberSelector
          subjectId={subjectId}
          subnivel={subnivel}
          competencyIds={competencyIds}
          saberIds={saberIds}
          onCompetencyIdsChange={setCompetencyIds}
          onSaberIdsChange={setSaberIds}
          isEditable
        />
      ) : (
        <SkillAndSaberSelector
          subjectId={subjectId}
          subnivel={subnivel}
          skillIds={skillIds}
          saberIds={saberIds}
          onSkillIdsChange={setSkillIds}
          onSaberIdsChange={setSaberIds}
          isEditable
        />
      )}

      <div className="max-w-[160px] space-y-1.5">
        <Label>Número de semanas</Label>
        <Input type="number" min={1} max={40} value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)} />
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button type="button" onClick={handleGenerate} disabled={selectedCount === 0} loading={draftBlock.isPending}>
          <Sparkles className="h-4 w-4" />
          Generar {weeksCount || 0} semana(s)
        </Button>
      </div>
    </Card>
  )
}
