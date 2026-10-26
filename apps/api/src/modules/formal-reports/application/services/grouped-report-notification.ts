type Roster = Array<{ studentId?: string; student?: string }>
const roster = (snapshot: unknown): Roster => {
  if (!snapshot || typeof snapshot !== 'object' || !('alertRoster' in snapshot) || !Array.isArray(snapshot.alertRoster)) return []
  return snapshot.alertRoster.filter((r): r is Roster[number] => !!r && typeof r === 'object')
}

/** El aviso describe la ampliación sin exponer los nombres de la nómina. */
export function groupedReportNotification(author: string, previousSnapshot: unknown, snapshot: unknown) {
  const previous = roster(previousSnapshot)
  const added = roster(snapshot).filter((row) => !previous.some((p) =>
    row.studentId && p.studentId ? row.studentId === p.studentId : !!row.student && row.student === p.student,
  )).length
  return {
    title: 'Actualización del informe agrupado',
    body: `${author} actualizó el informe${added ? ` y agregó ${added} estudiante${added === 1 ? '' : 's'}` : ''}. Revisa la nueva versión y registra el acuse de recibo.`,
  }
}
