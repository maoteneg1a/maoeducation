import * as React from 'react'
import { ChevronDown, ChevronRight, Leaf } from 'lucide-react'
import { useCurriculumSkillsForSubject } from '@/features/curriculum/hooks/useCurriculum'
import { useCompetenciesForSubject } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { useCurricularInsertionCandidates } from '../hooks/useCurricularInsertions'

const BANK_LABEL: Record<string, string> = {
  SOCIOEMOTIONAL_EDUCATION: 'Socioemocional',
  SUSTAINABLE_DEVELOPMENT: 'Desarrollo sostenible',
  CIVIC_ETHICS_INTEGRITY: 'Cívica y ética',
  ROAD_SAFETY_MOBILITY: 'Seguridad vial',
  FINANCIAL_EDUCATION: 'Educación financiera',
}

interface CurricularInsertionSuggestionsProps {
  subjectId: string | undefined
  subnivel: string | undefined
  itemIds: string[]
  kind: 'skill' | 'competency'
}

/**
 * Sugerencias de referencia de ejes de inserción curricular transversal (socio-
 * emocional, sostenible, cívica, vial, financiera) relacionadas a las destrezas/
 * competencias ya seleccionadas en la semana. Solo consulta — el docente decide
 * si incorporarlas al redactar, no se auto-aplican ni bloquean nada.
 */
export function CurricularInsertionSuggestions({ subjectId, subnivel, itemIds, kind }: CurricularInsertionSuggestionsProps) {
  const [expanded, setExpanded] = React.useState(false)
  const { data: skillsBank = [] } = useCurriculumSkillsForSubject(kind === 'skill' ? subjectId : undefined, kind === 'skill' ? subnivel : undefined)
  const { data: competenciesBank = [] } = useCompetenciesForSubject(kind === 'competency' ? subjectId : undefined, kind === 'competency' ? subnivel : undefined)

  const codes = React.useMemo(() => {
    if (kind === 'skill') return skillsBank.filter((s) => itemIds.includes(s.id)).map((s) => s.code)
    return competenciesBank.filter((c) => itemIds.includes(c.id)).map((c) => c.code)
  }, [kind, skillsBank, competenciesBank, itemIds])

  const { data: candidates = [] } = useCurricularInsertionCandidates(codes)

  if (codes.length === 0 || candidates.length === 0) return null

  return (
    <div className="rounded border border-emerald-200 bg-emerald-50/40">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-emerald-900 hover:bg-emerald-100/50"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <Leaf className="h-3.5 w-3.5" />
        <span className="flex-1 font-medium">Ejes de inserción curricular sugeridos</span>
        <span className="text-xs text-emerald-700">{candidates.length}</span>
      </button>
      {expanded && (
        <div className="space-y-1.5 border-t border-emerald-200 p-3">
          <p className="text-xs text-emerald-800">
            Referencias oficiales de otros ejes transversales conectados a lo que ya planificaste — úsalas como inspiración al redactar, no se agregan automáticamente.
          </p>
          {candidates.map((c) => (
            <div key={c.id} className="rounded bg-white/70 px-2 py-1.5 text-xs">
              <span className="mr-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
                {BANK_LABEL[c.bank.key] ?? c.bank.title}
              </span>
              {c.text || <span className="text-muted-foreground italic">(sin texto extraído)</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
