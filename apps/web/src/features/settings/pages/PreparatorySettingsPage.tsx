import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { getErrorMessage } from '@/shared/lib/utils'
import { preparatoryParallelLabel } from '@/features/preparatoria/parallel-label'
import { prepApi, type PrepContext } from '@/features/preparatoria/preparatoria.api'

const selectClass = 'rounded-md border bg-background px-3 py-2 text-sm max-w-full disabled:opacity-60'
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export function PreparatorySettingsPage() {
  const user = useAuthStore(state => state.user)
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [savedCount, setSavedCount] = useState(0)
  const optionsKey = ['preparatoria-options', user?.institutionId, user?.id]
  const options = useQuery({ queryKey: optionsKey, queryFn: prepApi.options })
  const parallels = options.data?.parallels ?? []
  const parallel = parallels.find(p => p.id === params.get('parallelId')) ?? parallels.find(p => p.isActiveYear) ?? parallels[0]
  const parallelId = parallel?.id ?? ''
  const contextKey = ['preparatoria-context', user?.institutionId, user?.id, parallelId]
  const context = useQuery({ queryKey: contextKey, queryFn: () => prepApi.context(parallelId), enabled: !!parallelId })

  async function applyConfiguration(updated: PrepContext) {
    await queryClient.invalidateQueries({ queryKey: ['preparatoria-context'], refetchType: 'none' })
    queryClient.setQueryData(contextKey, updated)
    setSavedCount(count => count + 1)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['preparatoria-sheet'] }),
      queryClient.invalidateQueries({ queryKey: ['preparatoria-copy'] }),
      queryClient.invalidateQueries({ queryKey: ['preparatoria-history'] }),
      queryClient.invalidateQueries({ queryKey: optionsKey }),
    ])
  }

  return (
    <section className="max-w-4xl space-y-5 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Configurar Preparatoria</h1>
      {options.isPending ? <p role="status">Cargando paralelos…</p> :
        options.isError ? <p role="alert">{getErrorMessage(options.error)}</p> :
        !parallels.length ? <p>No hay paralelos de Primero de Básica para configurar.</p> :
        <label className="grid w-fit gap-1 text-sm">
          Paralelo y año lectivo
          <select className={selectClass} value={parallelId} onChange={event => setParams({ parallelId: event.target.value }, { replace: true })}>
            {parallels.map(option => <option key={option.id} value={option.id}>{preparatoryParallelLabel(option)}</option>)}
          </select>
        </label>}
      {parallel && (context.isPending ? <p role="status">Cargando configuración…</p> :
        context.isError ? <p role="alert">{getErrorMessage(context.error)}</p> :
        context.data.canConfigure ? <ProgramConfiguration key={parallelId + ':' + savedCount} ctx={context.data} done={applyConfiguration} /> :
        <p role="alert">Solo la autoridad puede configurar Preparatoria.</p>)}
    </section>
  )
}

function ProgramConfiguration({ ctx, done }: { ctx: PrepContext; done: (updated: PrepContext) => Promise<void> }) {
  const [configuration, setConfiguration] = useState(ctx)
  const [busy, setBusy] = useState(false)
  const [reviewed, setReviewed] = useState(false)
  const [filter, setFilter] = useState('')
  const [enabled, setEnabled] = useState(ctx.program?.enabled ?? false)
  const [scale, setScale] = useState(ctx.program?.scaleVersion ?? '2026-00082A')
  const [teachers, setTeachers] = useState(ctx.program?.ambitTeachers ?? {})
  const [distribution, setDistribution] = useState(
    () => Object.fromEntries((ctx.program?.catalog ?? []).map(item => [item.key, item.ambit])),
  )
  const { program, curriculumLocked } = configuration
  const teacherIds = new Set(ctx.ambits.map(ambit => teachers[ambit.id] ?? ''))
  const commonTeacher = teacherIds.size === 1 ? (teachers[ctx.ambits[0].id] ?? '') : ''
  const teacherOptions = ctx.teachers.map(teacher => <option key={teacher.id} value={teacher.id}>{teacher.name}</option>)
  const matchingItems = program?.catalog.filter(item => normalize(item.code + ' ' + item.text).includes(normalize(filter)))

  async function prepare() {
    setBusy(true)
    try {
      const prepared = await prepApi.prepare(ctx.parallel.id)
      setConfiguration(prepared)
      setEnabled(prepared.program?.enabled ?? false)
      setScale(prepared.program?.scaleVersion ?? '2026-00082A')
      setTeachers(prepared.program?.ambitTeachers ?? {})
      setDistribution(Object.fromEntries((prepared.program?.catalog ?? []).map(item => [item.key, item.ambit])))
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function save() {
    if (!program) return
    setBusy(true)
    try {
      const updated = await prepApi.configure(ctx.parallel.id, {
        expectedRevision: program.revision,
        enabled,
        reviewed: true,
        scaleVersion: scale,
        ambitTeachers: Object.fromEntries(Object.entries(teachers).filter(([, teacherId]) => teacherId)),
        distribution: program.catalog.map(item => ({ key: item.key, ambit: distribution[item.key] })),
      })
      toast.success('Configuración guardada')
      await done(updated)
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">Ámbitos de {ctx.parallel.levelName} · {ctx.parallel.yearName}</h2>
        <p className="text-sm text-muted-foreground">Todos los paralelos del grado comparten los ocho ámbitos y la distribución de indicadores durante este año lectivo.</p>
        {curriculumLocked && <p className="text-sm text-muted-foreground">La distribución está protegida porque el grado ya tiene valoraciones.</p>}
        {!program ? <Button disabled={busy} onClick={() => void prepare()}>Preparar este paralelo</Button> :
          <details>
            <summary className="cursor-pointer text-sm font-medium">Revisar distribución · {program.catalog.length} indicadores</summary>
            <p className="my-3 text-xs text-muted-foreground">{ctx.catalogSource}</p>
            <Input aria-label="Buscar indicador" className="my-3" placeholder="Buscar indicador…" value={filter} onChange={event => setFilter(event.target.value)} />
            <div className="max-h-80 space-y-3 overflow-y-auto">
              {matchingItems?.map(item => (
                <label key={item.key} className="grid gap-1 border-b pb-3 text-sm">
                  <span>{item.code} · {item.text}</span>
                  <select className={selectClass} disabled={busy || curriculumLocked} value={distribution[item.key]} onChange={event => setDistribution(previous => ({ ...previous, [item.key]: event.target.value }))}>
                    {ctx.ambits.map(ambit => <option key={ambit.id} value={ambit.id}>{ambit.name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </details>}
      </section>
      {program && <>
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Evaluación de este paralelo</h2>
          <label className="grid max-w-sm gap-1 text-sm">
            Escala aplicable
            <select className={selectClass} value={scale} disabled={busy} onChange={event => setScale(event.target.value)}>
              <option value="2026-00082A">Acuerdo 2026-00082-A</option>
              <option value="2025-INSTRUCTIVO">Instructivo 2025 (régimen anterior)</option>
            </select>
          </label>
          <p className="text-xs text-muted-foreground">La escala queda protegida cuando este paralelo tiene valoraciones.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} disabled={busy} onChange={event => setEnabled(event.target.checked)} />
            Activar evaluación de Preparatoria en este paralelo
          </label>
        </section>
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">Docentes de este paralelo</h2>
          <p className="text-sm text-muted-foreground">Tutor {ctx.parallel.tutorName ?? 'sin asignar'}. Puedes elegir cualquier docente activo de la institución.</p>
          <label className="grid max-w-lg gap-1 text-sm">
            Asignar todos los ámbitos a
            <select
              className={selectClass}
              value={commonTeacher}
              disabled={busy}
              onChange={event => {
                const teacherId = event.target.value
                if (teacherId) setTeachers(Object.fromEntries(ctx.ambits.map(ambit => [ambit.id, teacherId])))
              }}
            >
              <option value="">{Object.values(teachers).some(Boolean) ? 'Asignación por ámbito' : 'Seleccionar docente'}</option>
              {teacherOptions}
            </select>
          </label>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Especialistas por ámbito (opcional)</summary>
            <div className="mt-3 space-y-3">
              {ctx.ambits.map(ambit => (
                <label key={ambit.id} className="grid items-center gap-2 text-sm sm:grid-cols-2">
                  {ambit.name}
                  <select className={selectClass} disabled={busy} value={teachers[ambit.id] ?? ''} onChange={event => setTeachers(previous => ({ ...previous, [ambit.id]: event.target.value }))}>
                    <option value="">Seleccionar docente</option>
                    {teacherOptions}
                  </select>
                </label>
              ))}
            </div>
          </details>
        </section>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reviewed} disabled={busy} onChange={event => setReviewed(event.target.checked)} />
          He revisado la distribución del grado, la escala y los responsables del paralelo.
        </label>
        <Button disabled={!reviewed || busy} onClick={() => void save()}>Guardar configuración</Button>
      </>}
    </div>
  )
}
