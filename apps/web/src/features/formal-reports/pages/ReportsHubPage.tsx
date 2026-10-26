import { useSearchParams, Link } from 'react-router-dom'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useAuthStore } from '@/store/auth.store'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { ReportsPage } from '@/features/reports/pages/ReportsPage'
import { ReportsInboxPage } from './ReportsInboxPage'

/** Una entrada de navegación; cada sección conserva sus permisos y sus datos. */
export function ReportsHubPage() {
  const { hasPermission } = usePermissions()
  const modules = useAuthStore((s) => s.user?.institution?.modules)
  const canDocuments = hasPermission('formal_reports:read')
  const canAcademic = hasPermission('reports:read') && (!modules || modules.includes('reports'))
  const [params, setParams] = useSearchParams()
  const preferred = params.get('section')
  const section = preferred === 'academic' && canAcademic ? 'academic' : canDocuments ? 'documents' : 'academic'
  if (!canDocuments && !canAcademic) return <EmptyState title="Sin informes disponibles" description="Tu perfil no tiene acceso a estas secciones." />
  return <div className="space-y-5 p-4 sm:p-6">
    <div><h1 className="text-2xl font-bold">Informes y reportes</h1>
      <p className="mt-1 text-sm text-muted-foreground">Encuentra tus informes, anexos, boletines y reportes de calificaciones en un solo lugar.</p></div>
    {hasPermission('early_alerts:read') && <p className="text-sm">
      <Link className="text-primary hover:underline" to="/academic-alerts">Alertas tempranas</Link>
      {' · '}<Link className="text-primary hover:underline" to="/refuerzo/casos">Planes de refuerzo</Link>
    </p>}
    <Tabs value={section} onValueChange={(value) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('section', value); return next })}>
      <TabsList className="flex-wrap">
        {canDocuments && <TabsTrigger value="documents">Informes y anexos</TabsTrigger>}
        {canAcademic && <TabsTrigger value="academic">Boletines y calificaciones</TabsTrigger>}
      </TabsList>
    </Tabs>
    {section === 'documents' && canDocuments && <ReportsInboxPage embedded />}
    {section === 'academic' && canAcademic && <ReportsPage embedded />}
  </div>
}
