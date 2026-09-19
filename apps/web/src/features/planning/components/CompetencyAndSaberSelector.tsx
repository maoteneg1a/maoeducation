import * as React from 'react'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
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
import type { CompetencySaberType } from '@/features/competency-curriculum/api/competency-curriculum.api'

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
                      <span className="font-mono text-xs text-muted-foreground">{competency.code}</span> {competency.text}
                    </span>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label>Saberes</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {competencyIds.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-3">Selecciona al menos una competencia para ver sus saberes.</p>
          ) : (
            competencyIds.map((competencyId) => (
              <CompetencySaberColumns
                key={competencyId}
                competencyId={competencyId}
                gradeCode={gradeCode}
                selectedSaberIds={saberIds}
                onToggle={(id) => onSaberIdsChange(saberIds.includes(id) ? saberIds.filter((s) => s !== id) : [...saberIds, id])}
                onBulkChange={(ids, add) =>
                  onSaberIdsChange(add ? [...new Set([...saberIds, ...ids])] : saberIds.filter((id) => !ids.includes(id)))
                }
                isEditable={isEditable}
              />
            ))
          )}
        </div>
      </div>
    </>
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
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar saber por código o texto..."
            className="h-7 pl-7 text-xs"
          />
        </div>
      )}
      {(['declarativo', 'procedimental', 'actitudinal'] as CompetencySaberType[]).map((type) => {
        const visible = byType(type)
        const selectedCount = visible.filter((s) => selectedSaberIds.includes(s.id)).length
        return (
          <div key={type} className="rounded border p-2">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                {SABER_TYPE_LABEL[type]} ({selectedCount} de {visible.length})
              </p>
              {isEditable && visible.length > 0 && (
                <div className="flex gap-1.5 text-[11px]">
                  <button type="button" className="text-primary hover:underline" onClick={() => onBulkChange(visible.map((s) => s.id), true)}>
                    Todos
                  </button>
                  <button type="button" className="text-muted-foreground hover:underline" onClick={() => onBulkChange(visible.map((s) => s.id), false)}>
                    Ninguno
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-1">
              {visible.map((saber) => {
                const selected = selectedSaberIds.includes(saber.id)
                return (
                  <button
                    key={saber.id}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => onToggle(saber.id)}
                    className={cn(
                      'flex w-full items-start gap-1.5 rounded px-1.5 py-1 text-left text-xs transition',
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
