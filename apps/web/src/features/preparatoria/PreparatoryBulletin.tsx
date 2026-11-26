import type { StudentBulletinData } from '@/features/reports/api/reports.api'

export function PreparatoryBulletin({data}:{data:StudentBulletinData}) {
 const report=data.preparatoria!
 const tutor=data.parallel.tutor?.profile
 return <article className="rounded-xl border bg-white text-slate-900 p-6 print:border-0 prep-bulletin space-y-5">
 <style>{`@media print { .prep-bulletin thead { display:table-header-group } .prep-bulletin tr { break-inside:avoid } .prep-bulletin h2 { break-after:avoid } }`}</style>
 <header className="flex items-center gap-4 border-b pb-4">{data.branding.logoUrl&&<img alt="Logo institucional" className="w-16 h-16 object-contain" src={data.branding.logoUrl}/>}<div><h2 className="font-bold text-lg">{data.branding.institutionName||data.institution.name}</h2><p className="font-semibold">INFORME DE COMPETENCIAS · PREPARATORIA</p><p>{data.academicYear.name}</p></div></header>
 <div className="grid sm:grid-cols-2 gap-2 text-sm"><p><strong>Estudiante:</strong> {data.student.profile.lastName} {data.student.profile.firstName}</p><p><strong>Identificación:</strong> {data.student.profile.dni||'—'}</p><p><strong>Curso:</strong> {data.parallel.level.name} {data.parallel.name}</p><p><strong>Docente tutor/a:</strong> {tutor?`${tutor.lastName} ${tutor.firstName}`:'—'}</p></div>
 {!report.rows.length&&<p className="border p-4">Todavía no se han seleccionado competencias para este paralelo.</p>}
 <div className="overflow-x-auto">
  <table className="w-full border-collapse text-sm">
   <thead><tr className="bg-slate-100"><th className="border p-3 text-left">Ámbito / competencia</th>{data.periods.map(period=><th className="min-w-24 border p-2" key={period.id}>{period.name}</th>)}</tr></thead>
   {report.axes.map(axis=>{
    const areas=report.ambits.filter(area=>area.axis===axis.id&&report.rows.some(row=>row.ambit===area.id))
    if(!areas.length)return null
    return <tbody key={axis.id}>
     <tr className="bg-slate-100"><th colSpan={data.periods.length+1} className="border p-2 text-left">{axis.name}</th></tr>
     {areas.flatMap(area=>[
      <tr key={area.id} className="bg-slate-50"><th colSpan={data.periods.length+1} className="border p-2 text-left font-medium">{area.name}</th></tr>,
      ...report.rows.filter(row=>row.ambit===area.id).map(row=><tr key={row.key}>
       <td className="border p-2"><strong>{row.code}</strong> · {row.text}{row.historical&&<span className="block text-xs text-slate-600">Indicador histórico</span>}</td>
       {data.periods.map(period=><td key={period.id} className="border p-2 text-center">{row.periods[period.id]?.code??(row.periods[period.id]?.selected?'Pendiente':'—')}</td>)}
      </tr>),
     ])}
    </tbody>
   })}
  </table>
 </div>
 <p className="text-xs text-slate-600">Pendiente: seleccionado sin valoración. —: no seleccionado en ese período. NE: no trabajado. Las valoraciones históricas se conservan aunque cambie la selección.</p><p className="text-xs">{report.scale.map(s=>`${s.code}: ${s.label}`).join(' · ')}</p>
 {data.periods.map(p=>{const attendance=data.attendanceByPeriod.find(a=>a.periodId===p.id),behavior=data.behaviorByPeriod.find(b=>b.periodId===p.id);return <section key={p.id} className="space-y-2 border-t pt-3 text-sm"><h3 className="font-bold">{p.name}</h3>{report.comments.find(c=>c.periodId===p.id)?.text&&<p className="whitespace-pre-wrap"><strong>Fortalezas y recomendaciones: </strong>{report.comments.find(c=>c.periodId===p.id)?.text}</p>}{report.rows.filter(r=>r.periods[p.id]?.notes).map(r=><p className="whitespace-pre-wrap" key={r.key}><strong>{r.code}: </strong>{r.periods[p.id].notes}</p>)}<p>{attendance?`Días asistidos: ${attendance.attendedDays} · Faltas justificadas: ${attendance.justifiedAbsences} · Injustificadas: ${attendance.unjustifiedAbsences} · Atrasos: ${attendance.lateCount}`:'Sin registro de asistencia'}</p><p>Comportamiento: {behavior?.code??'Pendiente'} {behavior?.notes}</p></section>})}
 {data.recommendations?.map((r,index)=><p key={index} className="whitespace-pre-wrap text-sm"><strong>{data.periods.find(p=>p.id===r.periodId)?.name} · Recomendaciones: </strong>{r.text}</p>)}
 <footer className="grid grid-cols-2 gap-8 pt-12 text-sm"><p className="border-t pt-2">{data.branding.teacherLabel||'Docente tutor/a'}<br/>{tutor?`${tutor.lastName} ${tutor.firstName}`:''}</p><p className="border-t pt-2">{data.branding.directorRole||'Director/a'}<br/>{data.branding.directorName}</p></footer>
 </article>
}
