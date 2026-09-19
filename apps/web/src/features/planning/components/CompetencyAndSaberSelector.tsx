import * as React from 'react'
import { Plus, Search, Pencil } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'
import {
  useCompetenciesForSubject,
  useSaberesForCompetency,
  useCreateCompetencySaber,
} from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { usePlannedCompetencies } from '../hooks/usePlanning'
import { CheckBox } from './SkillAndSaberSelector'
import type { Competency, CompetencySaberType } from '@/features/competency-curriculum/api/competency-curriculum.api'

const SABER_TYPE_LABEL: Record<CompetencySaberType, string> = {
  declarativo: 'Declarativos',
  procedimental: 'Procedimentales',
  actitudinal: 'Actitudinales',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

interface CompetencyAndSaberSelectorProps {
  subjectId: string | undefined
  subnivel: string | undefined
  competencyIds: string[]
  saberIds: string[]
  onCompetencyIdsChange: (ids: string[]) => void
  onSaberIdsChange: (ids: string[]) => void
  isEditable: boolean
  /** Igual que en SkillAndSaberSelector: si se dan ambos, restringe a lo ya planificado. */
  courseAssignmentId?: string
  academicPeriodId?: string
  /** Level.code real (ej. "6B") — filtra los saberes por granularidad TIGA (CompetencySaber.gradeCodes). */
  gradeCode?: string
  /**
   * OPCIONAL — indicadores específicos elegidos por el docente para esta
   * semana. Vacío (comportamiento por defecto de siempre) = se usan TODOS
   * los indicadores de las competencias seleccionadas automáticamente; el
   * generador de IA respeta esta selección si no está vacía (ver
   * DraftCompetencyWeekDto.selectedIndicatorIds).
   */
  indicatorIds?: string[]
  onIndicatorIdsChange?: (ids: string[]) => void
}

/** Equivalente a SkillAndSaberSelector pero para el modelo por COMPETENCIAS (CNC-MINEDUC). */
export function CompetencyAndSaberSelector({
  subjectId,
  subnivel,
  competencyIds,
  saberIds,
  onCompetencyIdsChange,
  onSaberIdsChange,
  isEditable,
  courseAssignmentId,
  academicPeriodId,
  gradeCode,
  indicatorIds,
  onIndicatorIdsChange,
}: CompetencyAndSaberSelectorProps) {
  const restrictToPlanned = !!courseAssignmentId && !!academicPeriodId
  const { data: fullBank = [] } = useCompetenciesForSubject(
    restrictToPlanned ? undefined : subjectId,
    restrictToPlanned ? undefined : subnivel,
  )
  const { data: plannedCompetencies = [] } = usePlannedCompetencies(courseAssignmentId, academicPeriodId)
  const availableCompetencies = restrictToPlanned ? plannedCompetencies : fullBank
  const [search, setSearch] = React.useState('')

  const filtered = React.useMemo(() => {
    const query = normalize(search.trim())
    const list = !query
      ? availableCompetencies
      : availableCompetencies.filter((c) => normalize(c.code).includes(query) || normalize(c.text).includes(query))
    return [...list].sort((a, b) => Number(competencyIds.includes(b.id)) - Number(competencyIds.includes(a.id)))
  }, [availableCompetencies, search, competencyIds])

  const toggleCompetency = (id: string) => {
    onCompetencyIdsChange(competencyIds.includes(id) ? competencyIds.filter((c) => c !== id) : [...competencyIds, id])
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>
            {restrictToPlanned ? 'Competencias planificadas' : 'Competencias del banco (CNC)'} ({competencyIds.length} de {availableCompetencies.length} seleccionada{competencyIds.length === 1 ? '' : 's'})
          </Label>
          {isEditable && availableCompetencies.length > 0 && (
            <div className="flex gap-2 text-xs">
              <button type="button" className="text-primary hover:underline" onClick={() => onCompetencyIdsChange([...new Set([...competencyIds, ...filtered.map((c) => c.id)])])}>
                Todas
              </button>
              <button type="button" className="text-muted-foreground hover:underline" onClick={() => onCompetencyIdsChange(competencyIds.filter((id) => !filtered.some((c) => c.id === id)))}>
                Ninguna
              </button>
            </div>
          )}
        </div>
        {!subjectId || !subnivel ? (
          <p className="text-sm text-muted-foreground">
            Esta materia no tiene área de competencias vinculada o el paralelo no tiene subnivel configurado.
          </p>
        ) : restrictToPlanned && availableCompetencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay competencias planificadas para este curso y periodo — ve a Planificación y agrega semanas primero.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código o texto..."
                className="mb-1.5 h-8 pl-7 text-sm"
              />
            </div>
            {filtered.length === 0 && (
              <p className="px-1 text-xs text-muted-foreground">Ninguna competencia coincide con la búsqueda.</p>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto rounded border p-2">
              {filtered.map((competency) => {
                const selected = competencyIds.includes(competency.id)
                return (
                  <button
                    key={competency.id}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => toggleCompetency(competency.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                      selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50',
                      !isEditable && 'cursor-default opacity-80',
                    )}
                  >
                    <CheckBox selected={selected} />
                    <span>
                      <span className="font-mono text-sm font-medium text-muted-foreground">{competency.code}</span> {competency.text}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {onIndicatorIdsChange && (
        <IndicatorSelector
          competencyIds={competencyIds}
          availableCompetencies={availableCompetencies}
          indicatorIds={indicatorIds ?? []}
          onIndicatorIdsChange={onIndicatorIdsChange}
          isEditable={isEditable}
        />
      )}

      <div className="space-y-2">
        <Label>Saberes</Label>
        {competencyIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Selecciona al menos una competencia para ver sus saberes.</p>
        ) : competencyIds.length === 1 ? (
          // Una sola competencia: columnas directo, sin indirección — es el caso simple y más común.
          <div className="grid gap-3 sm:grid-cols-3">
            <CompetencySaberColumns
              competencyId={competencyIds[0]}
              gradeCode={gradeCode}
              selectedSaberIds={saberIds}
              onToggle={(id) => onSaberIdsChange(saberIds.includes(id) ? saberIds.filter((s) => s !== id) : [...saberIds, id])}
              onBulkChange={(ids, add) =>
                onSaberIdsChange(add ? [...new Set([...saberIds, ...ids])] : saberIds.filter((id) => !ids.includes(id)))
              }
              isEditable={isEditable}
            />
          </div>
        ) : (
          // 2+ competencias: mezclar todas las columnas de saberes en la misma
          // vista es ilegible (mucho texto, sin saber a cuál competencia
          // pertenece cada uno) — una fila compacta por competencia, saberes
          // en un modal aparte que aísla claramente de cuál competencia son.
          <div className="space-y-1.5">
            {competencyIds.map((competencyId) => (
              <CompetencySaberRow
                key={competencyId}
                competency={availableCompetencies.find((c) => c.id === competencyId)}
                competencyId={competencyId}
                gradeCode={gradeCode}
                selectedSaberIds={saberIds}
                onToggle={(id) => onSaberIdsChange(saberIds.includes(id) ? saberIds.filter((s) => s !== id) : [...saberIds, id])}
                onBulkChange={(ids, add) =>
                  onSaberIdsChange(add ? [...new Set([...saberIds, ...ids])] : saberIds.filter((id) => !ids.includes(id)))
                }
                isEditable={isEditable}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * Indicadores de TODAS las competencias seleccionadas — por defecto (sin
 * tocar nada) se usan todos automáticamente, como siempre; esta sección
 * permite al docente elegir un subconjunto específico para esta semana.
 * Con 2+ competencias, cada indicador muestra el código de su competencia
 * para no confundir a cuál pertenece.
 */
function IndicatorSelector({
  competencyIds,
  availableCompetencies,
  indicatorIds,
  onIndicatorIdsChange,
  isEditable,
}: {
  competencyIds: string[]
  availableCompetencies: Competency[]
  indicatorIds: string[]
  onIndicatorIdsChange: (ids: string[]) => void
  isEditable: boolean
}) {
  const [search, setSearch] = React.useState('')
  const selectedCompetencies = competencyIds
    .map((id) => availableCompetencies.find((c) => c.id === id))
    .filter((c): c is Competency => !!c)
  const allIndicators = selectedCompetencies.flatMap((c) =>
    (c.indicators ?? []).map((i) => ({ ...i, competencyCode: c.code })),
  )
  const query = normalize(search.trim())
  const visible = !query
    ? allIndicators
    : allIndicators.filter((i) => normalize(i.code).includes(query) || normalize(i.text).includes(query))
  const selectedCount = visible.filter((i) => indicatorIds.includes(i.id)).length

  if (competencyIds.length === 0 || allIndicators.length === 0) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>
          Indicadores ({selectedCount} de {visible.length}) — vacío usa todos automáticamente
        </Label>
        {isEditable && visible.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => onIndicatorIdsChange([...new Set([...indicatorIds, ...visible.map((i) => i.id)])])}
            >
              Todos
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:underline"
              onClick={() => onIndicatorIdsChange(indicatorIds.filter((id) => !visible.some((i) => i.id === id)))}
            >
              Ninguno
            </button>
          </div>
        )}
      </div>
      {allIndicators.length > 4 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar indicador por código o texto..."
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}
      <div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
        {visible.map((indicator) => {
          const selected = indicatorIds.includes(indicator.id)
          return (
            <button
              key={indicator.id}
              type="button"
              disabled={!isEditable}
              onClick={() =>
                onIndicatorIdsChange(selected ? indicatorIds.filter((id) => id !== indicator.id) : [...indicatorIds, indicator.id])
              }
              className={cn(
                'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50',
              )}
            >
              <CheckBox selected={selected} />
              <span>
                {competencyIds.length > 1 && (
                  <Badge variant="secondary" className="mr-1.5 font-mono text-xs">{indicator.competencyCode}</Badge>
                )}
                <span className="font-mono text-sm font-medium text-muted-foreground">{indicator.code}</span> {indicator.text}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Fila compacta usada cuando hay 2+ competencias en la semana — evita mezclar los saberes de todas en la misma vista (confuso, mucho texto). Abre un modal con solo esta competencia y sus 3 columnas. */
function CompetencySaberRow({
  competency,
  competencyId,
  gradeCode,
  selectedSaberIds,
  onToggle,
  onBulkChange,
  isEditable,
}: {
  competency: { code: string; text: string } | undefined
  competencyId: string
  gradeCode?: string
  selectedSaberIds: string[]
  onToggle: (id: string) => void
  onBulkChange: (ids: string[], add: boolean) => void
  isEditable: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const { data: saberes = [] } = useSaberesForCompetency(competencyId, gradeCode)
  const selectedCount = saberes.filter((s) => selectedSaberIds.includes(s.id)).length

  return (
    <div className="flex items-center justify-between gap-2 rounded border px-3 py-2">
      <div className="flex items-center gap-2 overflow-hidden">
        <Badge variant="secondary" className="font-mono text-sm shrink-0">{competency?.code ?? '…'}</Badge>
        <span className="truncate text-sm text-muted-foreground">{competency?.text}</span>
      </div>
      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" />
        Saberes ({selectedCount} de {saberes.length})
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="secondary" className="font-mono text-base">{competency?.code}</Badge>
            </DialogTitle>
            <DialogDescription className="text-sm">{competency?.text}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-3">
            <CompetencySaberColumns
              competencyId={competencyId}
              gradeCode={gradeCode}
              selectedSaberIds={selectedSaberIds}
              onToggle={onToggle}
              onBulkChange={onBulkChange}
              isEditable={isEditable}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CompetencySaberColumns({
  competencyId,
  gradeCode,
  selectedSaberIds,
  onToggle,
  onBulkChange,
  isEditable,
}: {
  competencyId: string
  gradeCode?: string
  selectedSaberIds: string[]
  onToggle: (id: string) => void
  onBulkChange: (ids: string[], add: boolean) => void
  isEditable: boolean
}) {
  const { data: saberes = [] } = useSaberesForCompetency(competencyId, gradeCode)
  const createSaber = useCreateCompetencySaber()
  const [addingType, setAddingType] = React.useState<CompetencySaberType | null>(null)
  const [newCode, setNewCode] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')
  const [search, setSearch] = React.useState('')

  const byType = (type: CompetencySaberType) => {
    const all = saberes.filter((s) => s.type === type)
    const query = normalize(search.trim())
    if (!query) return all
    return all.filter((s) => normalize(s.code).includes(query) || normalize(s.description).includes(query))
  }

  const handleAdd = (type: CompetencySaberType) => {
    if (!newCode.trim() || !newDescription.trim()) return
    createSaber.mutate(
      { competencyId, type, code: newCode.trim(), description: newDescription.trim() },
      {
        onSuccess: () => {
          setNewCode('')
          setNewDescription('')
          setAddingType(null)
        },
      },
    )
  }

  return (
    <>
      {saberes.length > 3 && (
        <div className="relative sm:col-span-3">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar saber por código o texto..."
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}
      {(['declarativo', 'procedimental', 'actitudinal'] as CompetencySaberType[]).map((type) => {
        const visible = byType(type)
        const selectedCount = visible.filter((s) => selectedSaberIds.includes(s.id)).length
        return (
          <div key={type} className="rounded border p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-muted-foreground">
                {SABER_TYPE_LABEL[type]} ({selectedCount} de {visible.length})
              </p>
              {isEditable && visible.length > 0 && (
                <div className="flex gap-2 text-xs">
                  <button type="button" className="text-primary hover:underline" onClick={() => onBulkChange(visible.map((s) => s.id), true)}>
                    Todos
                  </button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => onBulkChange(visible.map((s) => s.id), false)}>
                    Ninguno
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {visible.map((saber) => {
                const selected = selectedSaberIds.includes(saber.id)
                return (
                  <button
                    key={saber.id}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => onToggle(saber.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                      selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50',
                    )}
                  >
                    <CheckBox selected={selected} />
                    <span>
                      <span className="font-mono text-muted-foreground">{saber.code}</span> {saber.description}
                    </span>
                  </button>
                )
              })}
              {isEditable && addingType === type ? (
                <div className="space-y-1 pt-1">
                  <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Código" className="h-7 text-xs" />
                  <Input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Descripción"
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-xs" onClick={() => handleAdd(type)} loading={createSaber.isPending}>
                      Agregar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setAddingType(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                isEditable && (
                  <button
                    type="button"
                    onClick={() => setAddingType(type)}
                    className="flex items-center gap-1 pt-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </button>
                )
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}
