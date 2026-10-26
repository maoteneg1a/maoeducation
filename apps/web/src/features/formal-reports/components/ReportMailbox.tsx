import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Clock3, FileText, Lock, UserRound } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Badge } from '@/shared/components/ui/badge'
import { ReportStatusBadge } from './ReportStatusBadge'
import type { FormalReport, ReportBox } from '../api/formal-reports.api'

const date = (value: string) => new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))

/** Abrir un documento no equivale a registrar su acuse de recibo. */
export function ReportMailbox({ reports, box }: { reports: FormalReport[]; box: ReportBox }) {
  const userId = useAuthStore((state) => state.user?.id)
  return <div className="space-y-3">
    {reports.map((report) => {
      const unread = box === 'inbox' && report.recipients.some((r) => r.userId === userId && !r.readAt)
      const pending = box === 'inbox' && report.permissions.canReceive
      const action = report.permissions.canEdit ? 'Continuar borrador'
        : pending ? 'Abrir y registrar acuse'
        : box === 'inbox' && report.permissions.canAttend ? 'Revisar y atender'
        : report.permissions.canNewVersion ? 'Revisar devolución' : 'Abrir informe'
      return <Link key={report.id} to={`/informes/${report.id}`}
        className={`group block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5 ${pending ? 'border-l-4 border-l-amber-400' : unread ? 'border-l-4 border-l-primary' : ''}`}>
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex ${pending ? 'bg-amber-50 text-amber-700' : 'bg-primary/10 text-primary'}`}><FileText className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{report.folio ?? 'Sin folio · borrador'}</span>
              {unread && <Badge variant="secondary">Sin leer</Badge>}
              {pending && <Badge variant="warning">Pendiente de acuse</Badge>}
              {report.confidential && <Badge variant="outline"><Lock className="mr-1 h-3 w-3" />Confidencial</Badge>}
            </div>
            <h2 className={`text-base leading-snug group-hover:text-primary ${unread ? 'font-bold' : 'font-semibold'}`}>{report.typeLabel}</h2>
            <p className="text-sm text-muted-foreground">De <span className="font-medium text-foreground">{report.author.name}</span> · Para {report.recipientInstanceLabel}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{report.student?.name ?? (report.scope === 'parallel' ? 'Informe del paralelo' : 'Informe institucional')}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{date(report.sentAt ?? report.updatedAt)}</span>
              {report.ackDeadlineAt && report.status === 'SENT' && <span className={`inline-flex items-center gap-1 ${report.overdue ? 'font-medium text-destructive' : ''}`}><Clock3 className="h-3.5 w-3.5" />Acuse hasta {date(report.ackDeadlineAt)}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-between">
            <ReportStatusBadge status={report.status} overdue={report.overdue} />
            <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">{action}<ArrowUpRight className="h-4 w-4" /></span>
          </div>
        </div>
      </Link>
    })}
  </div>
}
