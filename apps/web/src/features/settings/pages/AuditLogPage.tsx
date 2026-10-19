import { apiGet } from '@/shared/lib/api-client'
import { AuditLogView, type AuditFilters, type AuditLogPage as AuditPage } from '@/shared/components/audit/AuditLogView'

/** Bitácora de la institución: quién cambió notas, permisos, matrículas, etc. */
export function AuditLogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registro de cambios sensibles: notas, permisos de roles, matrículas, promoción, cambios de docente y más.
        </p>
      </div>
      <AuditLogView
        queryKey="audit-logs"
        fetchPage={(f: AuditFilters) => apiGet<AuditPage>('audit-logs', f)}
      />
    </div>
  )
}
