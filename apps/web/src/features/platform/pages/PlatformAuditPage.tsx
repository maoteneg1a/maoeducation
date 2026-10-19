import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AuditLogView } from '@/shared/components/audit/AuditLogView'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { platformApi } from '../api/platform.api'
import { useInstitutions } from '../hooks/usePlatform'

const ALL = '__all__'

export function PlatformAuditPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const institutionId = searchParams.get('institutionId') ?? ''
  const { data: institutions = [] } = useInstitutions()

  const extraFilters = useMemo(() => (institutionId ? { institutionId } : undefined), [institutionId])

  const sorted = useMemo(
    () => [...institutions].sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [institutions],
  )

  const onInstitutionChange = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value === ALL) next.delete('institutionId')
    else next.set('institutionId', value)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Auditoría</h1>
          <p className="text-sm text-slate-500">Acciones registradas en todas las instituciones y en esta consola</p>
        </div>
        <div className="w-full sm:w-72">
          <label className="text-xs text-muted-foreground" htmlFor="audit-institution">Institución</label>
          <Select value={institutionId || ALL} onValueChange={onInstitutionChange}>
            <SelectTrigger id="audit-institution">
              <SelectValue placeholder="Todas las instituciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas las instituciones</SelectItem>
              {sorted.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AuditLogView
        queryKey="platform-audit-logs"
        fetchPage={platformApi.getAuditLogs}
        showInstitution
        extraFilters={extraFilters}
      />
    </div>
  )
}
