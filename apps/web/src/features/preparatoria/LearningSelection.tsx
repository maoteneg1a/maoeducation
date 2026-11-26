import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Input } from '@/shared/components/ui/input'
import { getErrorMessage } from '@/shared/lib/utils'
import { preparatoryParallelLabel } from './parallel-label'
import { prepApi, type PrepContext, type PrepOption } from './preparatoria.api'

const selectClass = 'rounded-md border bg-background px-3 py-2 text-sm max-w-full'
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export function LearningSelection({ ctx, options, periodId, done }: {
  ctx: PrepContext
  options: PrepOption[]
  periodId: string
  done: () => Promise<void>
}) {
  const program = ctx.program!
  const [expectedRevision] = useState(program.revision)
  const [keys, setKeys] = useState(program.selections[periodId] ?? [])
  const [search, setSearch] = useState('')
  const [ambit, setAmbit] = useState('')
  const [busy, setBusy] = useState(false)
  const [source, setSource] = useState(ctx.parallel.id)
  const [sourcePeriod, setSourcePeriod] = useState('')
  const sourceContext = useQuery({
    queryKey: ['preparatoria-copy', ctx.parallel.id, source],
    queryFn: () => prepApi.context(source),
  })
  const isClosed = ctx.periods.find(period => period.id === periodId)?.isClosed
  const canEdit = (ambitId: string) => !isClosed && ctx.editableAmbits.includes(ambitId)
  const selectedKeys = new Set(keys)
  const visibleItems = program.catalog.filter(item =>
    (!ambit || item.ambit === ambit) && normalize(item.code + ' ' + item.text).includes(normalize(search)),
  )

  function updateSelection(itemKeys: string[], checked: boolean) {
    setKeys(previous => {
      const next = new Set(previous)
      for (const key of itemKeys) {
        if (checked) next.add(key)
        else next.delete(key)
      }
      return [...next]
    })
  }

  function copySelection() {
    const selected = sourceContext.data?.program?.selections[sourcePeriod]
    if (!selected) return
    const editableItems = program.catalog.filter(item => canEdit(item.ambit))
    const editableKeys = new Set(editableItems.map(item => item.key))
    setKeys(previous => [
      ...previous.filter(key => !editableKeys.has(key)),
      ...editableItems.filter(item => selected.includes(item.key)).map(item => item.key),
    ])
    toast.info('Selección copiada. Revisa los indicadores antes de guardar.')
  }

  async function save() {
    setBusy(true)
    try {
      await prepApi.selection(ctx.parallel.id, periodId, { expectedRevision, itemKeys: keys })
      toast.success('Aprendizajes del período guardados')
      await done()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">Ámbitos del período</legend>
        <p className="text-sm text-muted-foreground">Marca un ámbito para incluir todos sus indicadores. Puedes ajustar la selección individual abajo.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ctx.ambits.map(area => {
            const areaKeys = program.catalog.filter(item => item.ambit === area.id).map(item => item.key)
            const count = areaKeys.filter(key => selectedKeys.has(key)).length
            return (
              <label key={area.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                <Checkbox
                  ref={input => { if (input) input.indeterminate = count > 0 && count < areaKeys.length }}
                  className="mt-0.5"
                  checked={count > 0 && count === areaKeys.length}
                  disabled={busy || !canEdit(area.id) || !areaKeys.length}
                  onCheckedChange={checked => updateSelection(areaKeys, checked)}
                />
                <span>{area.name} <span className="whitespace-nowrap text-muted-foreground">· {count}/{areaKeys.length}</span></span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <details className="space-y-2 rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">Copiar selección de otro período o paralelo</summary>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Paralelo de origen" className={selectClass} value={source} onChange={event => { setSource(event.target.value); setSourcePeriod('') }}>
            {options.filter(option => option.enabled || option.id === ctx.parallel.id).map(option => <option key={option.id} value={option.id}>{preparatoryParallelLabel(option)}</option>)}
          </select>
          <select aria-label="Período de origen" className={selectClass} value={sourcePeriod} onChange={event => setSourcePeriod(event.target.value)}>
            <option value="">Período de origen</option>
            {sourceContext.data?.periods.map(period => <option key={period.id} value={period.id}>{period.name}</option>)}
          </select>
          <Button variant="outline" disabled={busy || isClosed || !sourcePeriod || !ctx.editableAmbits.length || sourceContext.isFetching} onClick={copySelection}>Copiar selección</Button>
        </div>
        {sourceContext.isError && <p role="alert">No se pudo consultar el origen.</p>}
      </details>

      <div className="flex flex-wrap gap-2">
        <Input aria-label="Buscar indicador" className="flex-1" placeholder="Buscar indicador…" value={search} onChange={event => setSearch(event.target.value)} />
        <select aria-label="Filtrar indicadores por ámbito" className={selectClass} value={ambit} onChange={event => setAmbit(event.target.value)}>
          <option value="">Todos los ámbitos</option>
          {ctx.ambits.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
        </select>
      </div>
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {visibleItems.map(item => (
          <label key={item.key} className="flex gap-3 border-b pb-3 text-sm">
            <Checkbox className="mt-1" disabled={!canEdit(item.ambit) || busy} checked={selectedKeys.has(item.key)} onCheckedChange={checked => updateSelection([item.key], checked)} />
            <span>
              <span className="block text-xs text-muted-foreground">{ctx.ambits.find(area => area.id === item.ambit)?.name}</span>
              <strong>{item.code}</strong> · {item.text}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={busy || !ctx.editableAmbits.length || isClosed} onClick={() => void save()}>Guardar selección</Button>
        <span className="text-sm">{program.catalog.filter(item => selectedKeys.has(item.key)).length} indicadores seleccionados</span>
      </div>
    </div>
  )
}
