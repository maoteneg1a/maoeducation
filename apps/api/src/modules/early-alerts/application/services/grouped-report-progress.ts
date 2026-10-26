type GroupReport = { id: string; status: string; snapshot: unknown }
type RosterRow = { studentId?: string; student?: string }

export function alertRoster(snapshot: unknown): RosterRow[] {
  if (!snapshot || typeof snapshot !== 'object' || !('alertRoster' in snapshot) || !Array.isArray(snapshot.alertRoster)) return []
  return snapshot.alertRoster.filter((row): row is RosterRow => !!row && typeof row === 'object')
}

const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')

/** Las versiones enviadas se consultan por su nómina congelada, no por las alertas actuales. */
export function groupedReportProgress(reports: GroupReport[], studentId: string, names: string[]) {
  const latest = reports.at(-1)
  const sent = reports.filter((r) => r.status !== 'DRAFT' && alertRoster(r.snapshot).some((row) =>
    row.studentId ? row.studentId === studentId : typeof row.student === 'string' && names.some((name) => normalized(name) === normalized(row.student!)),
  )).at(-1)
  return {
    grouped: true,
    reportId: latest?.id ?? null,
    sent: sent ? 1 : 0,
    drafts: latest?.status === 'DRAFT' ? 1 : 0,
    lastStatus: sent?.status ?? null,
    needsAmendment: !!latest && latest.status !== 'DRAFT' && !sent,
  }
}
