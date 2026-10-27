import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { ReportsInboxPage } from './ReportsInboxPage'

/** Una entrada de navegación; cada sección conserva sus permisos y sus datos. */
export function ReportsHubPage() {
  const { hasPermission } = usePermissions()
  const canDocuments = hasPermission('formal_reports:read')
  const [params] = useSearchParams()
  if (params.get('section') === 'academic' && hasPermission('reports:read')) {
    const report = params.get('report')
    return <Navigate to={report ? `/reports?report=${encodeURIComponent(report)}` : '/reports'} replace />
  }
  if (!canDocuments) return <EmptyState title="Sin informes disponibles" description="Tu perfil no tiene acceso a esta sección." />
  return <div className="space-y-5 p-4 sm:p-6">
    <div><h1 className="text-2xl font-bold">Informes y anexos</h1>
      <p className="mt-1 text-sm text-muted-foreground">Gestiona informes formales, documentos y anexos de seguimiento.</p></div>
    {hasPermission('early_alerts:read') && <p className="text-sm">
      <Link className="text-primary hover:underline" to="/academic-alerts">Alertas tempranas</Link>
      {' · '}<Link className="text-primary hover:underline" to="/refuerzo/casos">Planes de refuerzo</Link>
    </p>}
    <ReportsInboxPage embedded />
  </div>
}
