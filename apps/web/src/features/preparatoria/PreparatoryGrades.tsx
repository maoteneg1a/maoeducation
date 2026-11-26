import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Save, Search, FileText, History } from 'lucide-react'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog'
import { useUnsavedChanges } from '@/shared/hooks/useUnsavedChanges'
import { getErrorMessage } from '@/shared/lib/utils'
import { prepApi, type PrepContext, type PrepOption, type PrepValue, type PrepComment } from './preparatoria.api'

import { preparatoryParallelLabel } from './parallel-label'
import { LearningSelection } from './LearningSelection'

const selectClass = 'rounded-md border bg-background px-3 py-2 text-sm max-w-full disabled:opacity-60'
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase()

/** El flujo numérico se conserva íntegro y solo se monta cuando está seleccionado. */
export function PreparatoryGrades({ children }: {children:(onPendingChange:(dirty:boolean)=>void)=>ReactNode}) {
 const user = useAuthStore(s=>s.user)
 const options = useQuery({queryKey:['preparatoria-options',user?.institutionId,user?.id],queryFn:prepApi.options})
 const [mode,setMode] = useState('regular')
 const [regularDirty,setRegularDirty] = useState(false)
 const changeMode = async(next:string)=>{if(regularDirty&&!await confirmDialog({title:'¿Descartar los cambios sin guardar?',description:'Guarda las notas antes de cambiar de modalidad o descarta los cambios.',confirmText:'Descartar cambios',cancelText:'Seguir editando',destructive:true}))return;setRegularDirty(false);setMode(next)}
 if (mode==='prep' && options.data?.parallels.length) return <PreparatoryWorkspace options={options.data.parallels} onExit={()=>setMode('regular')}/>
 if (!options.data?.parallels.length) return <>{children(setRegularDirty)}</>
 return <div className="space-y-5"><div className="flex flex-wrap gap-3 items-center px-4 pt-4 sm:px-6"><BookOpen className="h-5 w-5"/><span className="font-medium">Tipo de evaluación</span><select aria-label="Tipo de evaluación" className={selectClass} value={mode} onChange={e=>void changeMode(e.target.value)}><option value="regular">Calificaciones por asignatura</option><option value="prep">Preparatoria · Aprendizajes</option></select></div>{mode==='prep'?<PreparatoryWorkspace options={options.data.parallels} onExit={()=>setMode('regular')}/>:children(setRegularDirty)}</div>
}

function PreparatoryWorkspace({options,onExit}:{options:PrepOption[];onExit:()=>void}) {
 const user = useAuthStore(s=>s.user)
 const [parallelId,setParallel] = useState(options.find(p=>p.isActiveYear)?.id??options[0].id)
 const [periodChoice,setPeriod] = useState('')
 const [search,setSearch] = useState(''), [ambit,setAmbit] = useState(''), [studentChoice,setStudentChoice] = useState('')
 const [values,setValues] = useState<Record<string,PrepValue>>({}), [comments,setComments] = useState<Record<string,PrepComment>>({})
 const [baseRevision,setRevision] = useState<number|null>(null)
 const [saving,setSaving] = useState(false), [panel,setPanel] = useState<'selection'|'history'|null>(null)
 const context = useQuery({queryKey:['preparatoria-context',user?.institutionId,user?.id,parallelId],queryFn:()=>prepApi.context(parallelId)})
 const ctx = context.data
 const periodId = ctx?.periods.find(p=>p.id===periodChoice)?.id ?? ctx?.periods.find(p=>p.isActive)?.id ?? ctx?.periods[0]?.id ?? ''
 const sheet = useQuery({queryKey:['preparatoria-sheet',user?.institutionId,user?.id,parallelId,periodId],queryFn:()=>prepApi.sheet(parallelId,periodId),enabled:!!ctx?.program?.enabled&&!!periodId})
 const periodClosed = !!ctx?.periods.find(p=>p.id===periodId)?.isClosed
 const dirty = Object.keys(values).length>0||Object.keys(comments).length>0
 const {confirmDiscard} = useUnsavedChanges(dirty)
 const clear = ()=>{setValues({});setComments({});setRevision(null)}
 const change = async (fn:()=>void)=>{if(await confirmDiscard()){clear();fn()}}
 const refresh = async()=>{await Promise.all([context.refetch(),sheet.refetch()])}
 const captureRevision = ()=>setRevision(r=>r??sheet.data?.revision??null)
 const edit = (studentId:string,itemKey:string,patch:Partial<PrepValue>)=>{
  captureRevision(); const key=`${studentId}:${itemKey}`
  setValues(prev=>{const old=prev[key]??sheet.data?.values.find(v=>v.studentId===studentId&&v.itemKey===itemKey);return {...prev,[key]:{studentId,itemKey,code:old?.code??null,notes:old?.notes??'',...patch}}})
 }
 const save = async()=>{
  if(baseRevision===null||periodClosed)return;setSaving(true)
  try {await prepApi.save(parallelId,periodId,{expectedRevision:baseRevision,values:Object.values(values),comments:Object.values(comments)});clear();await refresh();toast.success('Valoraciones guardadas')} catch(e){toast.error(getErrorMessage(e))} finally{setSaving(false)}
 }
 const students = sheet.data?.students.filter(s=>normalize(`${s.name} ${s.document}`).includes(normalize(search)))??[]
 const items = ctx?.program?.catalog.filter(i=>sheet.data?.selectedKeys.includes(i.key)&&(!ambit||i.ambit===ambit))??[]
 const open = (p:typeof panel)=>void change(()=>setPanel(p))
 return <section className="min-w-0 space-y-5 p-4 sm:p-6">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Aprendizajes de Preparatoria</h1><p className="text-muted-foreground">Valoración cualitativa por estudiante y período.</p></div><Button variant="outline" onClick={()=>void change(onExit)}>Volver a asignaturas</Button></div>
  <div className="flex flex-wrap gap-3"><label className="grid gap-1 text-sm">Curso, jornada y año<select className={selectClass} value={parallelId} disabled={saving} onChange={e=>{const next=e.target.value;void change(()=>{setParallel(next);setPeriod('');setAmbit('');setStudentChoice('')})}}>{options.map(p=><option key={p.id} value={p.id}>{preparatoryParallelLabel(p)}</option>)}</select></label><label className="grid gap-1 text-sm">Período<select className={selectClass} value={periodId} disabled={saving} onChange={e=>{const next=e.target.value;void change(()=>setPeriod(next))}}>{ctx?.periods.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
  {periodClosed&&<p className="rounded border p-3 text-sm">Período cerrado: solo consulta.</p>}
  {context.isLoading&&<p role="status">Cargando Preparatoria…</p>}
  {context.isError&&<p role="alert" className="text-destructive">{getErrorMessage(context.error)} <Button variant="outline" onClick={()=>void context.refetch()}>Reintentar</Button></p>}
  {ctx&&<>
   <div className="flex flex-wrap gap-2">{ctx.program?.enabled&&<>{!!ctx.editableAmbits.length&&!periodClosed&&<Button variant="outline" onClick={()=>open('selection')}>Elegir aprendizajes</Button>}{ctx.canConfigure&&<Button variant="outline" onClick={()=>open('history')}><History className="h-4 w-4 mr-2"/>Historial</Button>}<Button asChild variant="outline"><Link to={`/reports?report=bulletin&yearId=${encodeURIComponent(ctx.parallel.yearId)}&parallelId=${encodeURIComponent(ctx.parallel.id)}`}><FileText className="h-4 w-4 mr-2"/>Boletines</Link></Button></>}</div>
   {!ctx.program?.enabled?<div className="rounded-xl border p-6 bg-muted/30"><h2 className="font-semibold">Evaluación pendiente de activación</h2><p className="mt-2 text-sm text-muted-foreground">La autoridad puede activarla para este paralelo en Configuración.</p>{ctx.canConfigure&&<Button variant="outline" className="mt-3" asChild><Link to={`/settings/preparatoria?parallelId=${encodeURIComponent(ctx.parallel.id)}`}>Ir a Configuración de Preparatoria</Link></Button>}</div>:<>
    <div className="flex flex-wrap gap-3"><label className="relative flex-1 min-w-52"><span className="sr-only">Buscar estudiante</span><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" placeholder="Buscar por nombre o identificación…" value={search} onChange={e=>setSearch(e.target.value)}/></label><select aria-label="Filtrar ámbito" className={selectClass} value={ambit} onChange={e=>setAmbit(e.target.value)}><option value="">Todos los ámbitos</option>{ctx.ambits.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
    <p className="text-sm text-muted-foreground">Pendiente = sin valorar. NE = no trabajado. No se calcula un promedio numérico. {dirty&&<strong className="text-amber-700">Hay cambios sin guardar.</strong>}</p>
    {sheet.isError?<p role="alert">{getErrorMessage(sheet.error)}</p>:sheet.isLoading?<p role="status">Cargando estudiantes…</p>:<>
     <label className="grid gap-1 text-sm md:hidden">Estudiante<select className={selectClass} value={students.some(s=>s.id===studentChoice)?studentChoice:students[0]?.id??''} onChange={e=>setStudentChoice(e.target.value)}>{students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     {!items.length&&<p className="rounded-lg border p-6">Selecciona los aprendizajes que se trabajarán en este período desde «Elegir aprendizajes».</p>}
     <div className="overflow-x-auto rounded-xl border hidden md:block"><table className="w-full text-sm"><thead><tr><th className="p-3 text-left sticky left-0 bg-muted z-10 min-w-60">Estudiante</th>{items.map(i=><th key={i.key} className="p-3 min-w-64 max-w-80 text-left align-top bg-muted"><span className="text-xs text-muted-foreground">{ctx.ambits.find(a=>a.id===i.ambit)?.name}</span><div>{i.code}</div><p className="font-normal mt-1">{i.text}</p></th>)}</tr></thead><tbody>{students.map(s=><tr key={s.id} className="border-t"><th className="p-3 text-left sticky left-0 bg-background z-10 font-medium">{s.name}<span className="block text-xs text-muted-foreground">{s.document}</span>{ctx.canComment&&!periodClosed&&<details className="mt-2"><summary className="cursor-pointer text-xs">Fortalezas y recomendaciones</summary><textarea aria-label={`Recomendaciones de ${s.name}`} className="border rounded w-full p-2 font-normal" maxLength={4000} value={comments[s.id]?.text??sheet.data?.comments.find(c=>c.studentId===s.id)?.text??''} onChange={e=>{captureRevision();setComments(p=>({...p,[s.id]:{studentId:s.id,text:e.target.value}}))}}/></details>}</th>{items.map(i=><td key={i.key} className="p-3 align-top">{cell(s.id,s.name,i.key,i.ambit)}</td>)}</tr>)}</tbody></table></div>
     <div className="md:hidden space-y-3">{students.filter(s=>s.id===(students.some(x=>x.id===studentChoice)?studentChoice:students[0]?.id)).map(s=><div key={s.id}><h2 className="font-semibold mb-3">{s.name}</h2>{items.map(i=><div className="border rounded-lg p-3 mb-3" key={i.key}><p className="text-xs text-muted-foreground">{ctx.ambits.find(a=>a.id===i.ambit)?.name} · {i.code}</p><p className="my-2 text-sm">{i.text}</p>{cell(s.id,s.name,i.key,i.ambit)}</div>)}{ctx.canComment&&!periodClosed&&<label className="grid text-sm gap-1">Fortalezas y recomendaciones<textarea className="border rounded p-2" maxLength={4000} value={comments[s.id]?.text??sheet.data?.comments.find(c=>c.studentId===s.id)?.text??''} onChange={e=>{captureRevision();setComments(p=>({...p,[s.id]:{studentId:s.id,text:e.target.value}}))}}/></label>}</div>)}</div>
     {!students.length&&<p className="p-4 text-muted-foreground">No hay estudiantes que coincidan con la búsqueda.</p>}
    </>}
    <div className="flex flex-wrap items-center gap-3"><Button disabled={!dirty||saving||periodClosed} onClick={()=>void save()}><Save className="h-4 w-4 mr-2"/>{saving?'Guardando…':'Guardar valoraciones'}</Button><Button variant="outline" disabled={saving} onClick={()=>void change(()=>void refresh())}>Recargar</Button><span role="status" className="text-sm text-muted-foreground">{dirty?'Hay cambios sin guardar · ':''}{sheet.data?.students.length??0} estudiantes · {sheet.data?.selectedKeys.length??0} aprendizajes seleccionados</span></div>
   </>}
   <Dialog open={!!panel} onOpenChange={o=>{if(!o)setPanel(null)}}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{panel==='history'?'Historial de cambios':ctx.periods.find(period=>period.id===periodId)?.name??'Aprendizajes del período'}</DialogTitle><DialogDescription><span className="block font-medium text-foreground mb-1">{preparatoryParallelLabel(ctx.parallel)}</span>{panel==='selection'?'Selecciona los ámbitos e indicadores que trabajará este paralelo. Las valoraciones históricas se conservan.':null}</DialogDescription></DialogHeader>{panel==='selection'?<LearningSelection ctx={ctx} options={options} periodId={periodId} done={async()=>{setPanel(null);await refresh()}}/>:panel==='history'?<ProgramHistory parallelId={parallelId}/>:null}</DialogContent></Dialog>
  </>}
 </section>
 function cell(studentId:string,name:string,itemKey:string,itemAmbit:string) {
  const value=values[`${studentId}:${itemKey}`]??sheet.data?.values.find(v=>v.studentId===studentId&&v.itemKey===itemKey)
  const editable=!!ctx?.editableAmbits.includes(itemAmbit)&&!saving&&!periodClosed
  return <div className="space-y-2"><select aria-label={`${name} · ${itemKey}`} className={selectClass+' w-full'} disabled={!editable} value={value?.code??''} onChange={e=>edit(studentId,itemKey,{code:e.target.value||null})}><option value="">Pendiente</option>{ctx?.scale.map(s=><option key={s.code} value={s.code}>{s.code} · {s.label}</option>)}</select><details><summary className="text-xs cursor-pointer text-muted-foreground">Observación{value?.notes?' · registrada':''}</summary><textarea aria-label={`Observación ${name} · ${itemKey}`} className="w-full border rounded p-2" disabled={!editable} maxLength={2000} value={value?.notes??''} onChange={e=>edit(studentId,itemKey,{notes:e.target.value})}/></details></div>
 }
}

function ProgramHistory({parallelId}:{parallelId:string}) {
 const history=useQuery({queryKey:['preparatoria-history',parallelId],queryFn:()=>prepApi.history(parallelId)})
 const labels:Record<string,string>={'preparatoria.configure':'Configuración revisada','preparatoria.distribution':'Distribución de indicadores del grado actualizada','preparatoria.selection':'Selección del período actualizada','preparatoria.values':'Valoraciones guardadas'}
 return <div className="space-y-2">{history.isLoading?'Cargando…':history.isError?'No se pudo consultar el historial.':!history.data?.items.length?'Todavía no hay cambios registrados.':history.data.items.map(i=><p className="border-b py-2 text-sm" key={i.id}>{new Date(i.createdAt).toLocaleString('es-EC')} · {labels[i.action]??i.action}</p>)}</div>
}
