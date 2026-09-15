import * as React from 'react'
import { Check, Plus, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'
import { useCurriculumSkillsForSubject, useSaberesForSkill, useCreateSaber } from '@/features/curriculum/hooks/useCurriculum'
import type { SaberType } from '@/features/curriculum/api/curriculum.api'

const SABER_TYPE_LABEL: Record<SaberType, string> = {
  declarativo: 'Declarativos',
  procedimental: 'Procedimentales',
  actitudinal: 'Actitudinales',
}

interface SkillAndSaberSelectorProps {
  subjectId: string | undefined
  subnivel: string | undefined
  skillIds: string[]
  saberIds: string[]
  onSkillIdsChange: (ids: string[]) => void
  onSaberIdsChange: (ids: string[]) => void
  isEditable: boolean
}

/**
 * Selector de destrezas del banco curricular + sus saberes (declarativo/
 * procedimental/actitudinal), con buscador. Reusado por el editor de semana
 * (WeekCard) y por los proyectos interdisciplinarios — misma lógica, mismo
 * banco, sin duplicar ~150 líneas.
 */
export function SkillAndSaberSelector({
  subjectId,
  subnivel,
  skillIds,
  saberIds,
  onSkillIdsChange,
  onSaberIdsChange,
  isEditable,
}: SkillAndSaberSelectorProps) {
  const { data: availableSkills = [] } = useCurriculumSkillsForSubject(subjectId, subnivel)
  const [skillSearch, setSkillSearch] = React.useState('')

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')

  const filteredSkills = React.useMemo(() => {
    const query = normalize(skillSearch.trim())
    const list = !query
      ? availableSkills
      : availableSkills.filter(
          (s) => normalize(s.code).includes(query) || normalize(s.description).includes(query),
        )
    // las ya seleccionadas siempre aparecen primero, para no "perderlas" al filtrar
    return [...list].sort((a, b) => Number(skillIds.includes(b.id)) - Number(skillIds.includes(a.id)))
  }, [availableSkills, skillSearch, skillIds])

  const toggleSkill = (skillId: string) => {
    onSkillIdsChange(skillIds.includes(skillId) ? skillIds.filter((s) => s !== skillId) : [...skillIds, skillId])
  }
  const toggleSaber = (saberId: string) => {
    onSaberIdsChange(saberIds.includes(saberId) ? saberIds.filter((s) => s !== saberId) : [...saberIds, saberId])
  }

  return (
    <>
      <div className="space-y-2">
        <Label>Destrezas del banco curricular ({skillIds.length} seleccionada{skillIds.length === 1 ? '' : 's'})</Label>
        {!subjectId || !subnivel ? (
          <p className="text-sm text-muted-foreground">
            Esta materia no tiene área curricular vinculada o el paralelo no tiene subnivel configurado.
          </p>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder="Buscar por código o descripción..."
                className="mb-1.5 h-8 pl-7 text-sm"
              />
            </div>
            {filteredSkills.length === 0 && (
              <p className="px-1 text-xs text-muted-foreground">Ninguna destreza coincide con la búsqueda.</p>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto rounded border p-2">
              {filteredSkills.map((skill) => {
                const selected = skillIds.includes(skill.id)
                return (
                  <button
                    key={skill.id}
                    type="button"
                    disabled={!isEditable}
                    onClick={() => toggleSkill(skill.id)}
                    className={cn(
                      'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                      selected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted/50',
                      !isEditable && 'cursor-default opacity-80',
                    )}
                  >
                    <CheckBox selected={selected} />
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{skill.code}</span> {skill.description}
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
          {skillIds.length === 0 ? (
            <p className="text-sm text-muted-foreground sm:col-span-3">Selecciona al menos una destreza para ver sus saberes.</p>
          ) : (
            skillIds.map((skillId) => (
              <SaberColumns
                key={skillId}
                skillId={skillId}
                selectedSaberIds={saberIds}
                onToggle={toggleSaber}
                isEditable={isEditable}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

export function CheckBox({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
        selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
      )}
    >
      {selected && <Check className="h-3 w-3" />}
    </span>
  )
}

function SaberColumns({
  skillId,
  selectedSaberIds,
  onToggle,
  isEditable,
}: {
  skillId: string
  selectedSaberIds: string[]
  onToggle: (id: string) => void
  isEditable: boolean
}) {
  const { data: saberes = [] } = useSaberesForSkill(skillId)
  const createSaber = useCreateSaber()
  const [addingType, setAddingType] = React.useState<SaberType | null>(null)
  const [newCode, setNewCode] = React.useState('')
  const [newDescription, setNewDescription] = React.useState('')

  const byType = (type: SaberType) => saberes.filter((s) => s.type === type)

  const handleAdd = (type: SaberType) => {
    if (!newCode.trim() || !newDescription.trim()) return
    createSaber.mutate(
      { skillId, type, code: newCode.trim(), description: newDescription.trim() },
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
      {(['declarativo', 'procedimental', 'actitudinal'] as SaberType[]).map((type) => (
        <div key={type} className="rounded border p-2">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{SABER_TYPE_LABEL[type]}</p>
          <div className="space-y-1">
            {byType(type).map((saber) => {
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
      ))}
    </>
  )
}
