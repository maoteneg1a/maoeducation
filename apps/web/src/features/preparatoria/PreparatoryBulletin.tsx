import type { StudentBulletinData } from '@/features/reports/api/reports.api'

export function PreparatoryBulletin({data}:{data:StudentBulletinData}) {
 const report=data.preparatoria!
 const tutor=data.parallel.tutor?.profile
 const attendanceByPeriod = new Map(data.attendanceByPeriod.map(row => [row.periodId, row]))
 const behaviorByPeriod = new Map(data.behaviorByPeriod.map(row => [row.periodId, row]))
 const summaryRows = [
  { label: 'Días asistidos', values: data.periods.map(period => attendanceByPeriod.get(period.id)?.attendedDays ?? '—') },
  { label: 'Faltas justificadas', values: data.periods.map(period => attendanceByPeriod.get(period.id)?.justifiedAbsences ?? '—') },
  { label: 'Faltas injustificadas', values: data.periods.map(period => attendanceByPeriod.get(period.id)?.unjustifiedAbsences ?? '—') },
  { label: 'Atrasos', values: data.periods.map(period => attendanceByPeriod.get(period.id)?.lateCount ?? '—') },
  { label: 'Comportamiento', values: data.periods.map(period => behaviorByPeriod.get(period.id)?.code ?? 'Pendiente') },
 ]
 return <article className="rounded-xl border bg-white text-slate-900 p-6 print:border-0 prep-bulletin space-y-5">
 <style>{`@media print { .prep-bulletin thead { display:table-header-group } .prep-bulletin tr { break-inside:avoid } .prep-bulletin h2 { break-after:avoid } }`}</style>
 <header className="flex items-center gap-4 border-b pb-4">{data.branding.logoUrl&&<img alt="Logo institucional" className="w-16 h-16 object-contain" src={data.branding.logoUrl}/>}<div><h2 className="font-bold text-lg">{data.branding.institutionName||data.institution.name}</h2><p className="font-semibold">INFORME DE APRENDIZAJES · PREPARATORIA</p><p>{data.academicYear.name}</p></div></header>
 <div className="grid sm:grid-cols-2 gap-2 text-sm"><p><strong>Estudiante:</strong> {data.student.profile.lastName} {data.student.profile.firstName}</p><p><strong>Identificación:</strong> {data.student.profile.dni||'—'}</p><p><strong>Curso:</strong> {data.parallel.level.name} {data.parallel.name}</p><p><strong>Docente tutor/a:</strong> {tutor?`${tutor.lastName} ${tutor.firstName}`:'—'}</p></div>
 {!report.rows.length&&<p className="border p-4">Todavía no se han seleccionado aprendizajes para este paralelo.</p>}
 <div className="overflow-x-auto"><table className="w-full border-collapse text-sm"><thead><tr className="bg-slate-100"><th className="border p-3 text-left">Ámbito / aprendizaje</th>{data.periods.map(p=><th className="border p-2 min-w-24" key={p.id}>{p.name}</th>)}</tr></thead><tbody>{report.ambits.flatMap(a=>{const rows=report.rows.filter(r=>r.ambit===a.id);return rows.length?[<tr key={a.id} className="bg-slate-50"><th className="border p-2 text-left" colSpan={data.periods.length+1}>{a.name}</th></tr>,...rows.map(r=><tr key={r.key}><td className="border p-2"><strong>{r.code}</strong> · {r.text}{r.historicalCompetency&&<span className="block text-xs text-slate-600">Competencia histórica</span>}</td>{data.periods.map(p=><td key={p.id} className="border p-2 text-center">{r.periods[p.id]?.code??(r.periods[p.id]?.selected?'Pendiente':'—')}</td>)}</tr>)]:[]})}</tbody></table></div>
 {!!data.periods.length && <div className="overflow-x-auto">
  <table className="w-full border-collapse text-sm">
   <caption className="mb-2 text-left font-semibold">Asistencia y comportamiento</caption>
   <thead>
    <tr className="bg-slate-100">
     <th scope="col" className="border p-2 text-left">Indicador</th>
     {data.periods.map(period => <th scope="col" key={period.id} className="min-w-24 border p-2">{period.name}</th>)}
    </tr>
   </thead>
   <tbody>
    {summaryRows.map(row => <tr key={row.label}>
     <th scope="row" className="border p-2 text-left font-medium">{row.label}</th>
     {data.periods.map((period, index) => <td key={period.id} className="border p-2 text-center">{row.values[index]}</td>)}
    </tr>)}
   </tbody>
  </table>
 </div>}
 <p className="text-xs text-slate-600">Pendiente: seleccionado sin valoración. —: no seleccionado en ese período. NE: no trabajado. Las valoraciones históricas se conservan aunque cambie la selección.</p><p className="text-xs">{report.scale.map(s=>`${s.code}: ${s.label}`).join(' · ')}</p>
 {data.periods.map(period => {
  const comment = report.comments.find(row => row.periodId === period.id)?.text
  const observedRows = report.rows.filter(row => row.periods[period.id]?.notes)
  const behaviorNotes = behaviorByPeriod.get(period.id)?.notes
  if (!comment && !observedRows.length && !behaviorNotes) return null
  return <section key={period.id} className="space-y-2 border-t pt-3 text-sm">
   <h3 className="font-bold">{period.name}</h3>
   {comment && <p className="whitespace-pre-wrap"><strong>Fortalezas y recomendaciones</strong> · {comment}</p>}
   {observedRows.map(row => <p className="whitespace-pre-wrap" key={row.key}><strong>{row.code}</strong> · {row.periods[period.id].notes}</p>)}
   {behaviorNotes && <p className="whitespace-pre-wrap"><strong>Observación de comportamiento</strong> · {behaviorNotes}</p>}
  </section>
 })}
 {data.recommendations?.map((r,index)=><p key={index} className="whitespace-pre-wrap text-sm"><strong>{data.periods.find(p=>p.id===r.periodId)?.name} · Recomendaciones: </strong>{r.text}</p>)}
 <footer className="grid grid-cols-2 gap-8 pt-12 text-sm"><p className="border-t pt-2">{data.branding.teacherLabel||'Docente tutor/a'}<br/>{tutor?`${tutor.lastName} ${tutor.firstName}`:''}</p><p className="border-t pt-2">{data.branding.directorRole||'Director/a'}<br/>{data.branding.directorName}</p></footer>
 </article>
}
