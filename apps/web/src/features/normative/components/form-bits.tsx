import type * as React from 'react'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { cn } from '@/shared/lib/utils'

const fmtHint = (v: unknown) =>
  typeof v === 'number' ? v.toFixed(2).replace('.', ',') : v == null ? 'sin tope' : String(v)

export function Hint({ preset }: { preset?: unknown }) {
  if (preset === undefined) return null
  return <span className="text-[11px] text-muted-foreground">Acuerdo: {fmtHint(preset)}</span>
}

export function NumField({
  label, value, onChange, preset, step = 0.01, min, max, nullable, integer, className,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  preset?: unknown
  step?: number
  min?: number
  max?: number
  nullable?: boolean
  integer?: boolean
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step={integer ? 1 : step}
        min={min}
        max={max}
        value={value ?? ''}
        placeholder={nullable ? 'Sin tope' : undefined}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') return onChange(nullable ? null : 0)
          const n = integer ? parseInt(raw, 10) : parseFloat(raw.replace(',', '.'))
          onChange(Number.isFinite(n) ? n : nullable ? null : 0)
        }}
      />
      <Hint preset={preset} />
    </div>
  )
}

export function SelectField<T extends string>({
  label, value, onChange, options, preset, className,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: Array<{ value: T; label: string }>
  preset?: T
  className?: string
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {preset !== undefined && <Hint preset={options.find((o) => o.value === preset)?.label ?? preset} />}
    </div>
  )
}

export function CheckField({ label, checked, onChange, description }: { label: string; checked: boolean; onChange: (v: boolean) => void; description?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span>
        {label}
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
    </label>
  )
}

export function CheckGroup({
  label, options, values, onChange, preset,
}: {
  label: string
  options: Array<{ value: string; label: string }>
  values: string[]
  onChange: (v: string[]) => void
  preset?: string[]
}) {
  const toggle = (v: string, on: boolean) =>
    onChange(on ? [...new Set([...values, v])] : values.filter((x) => x !== v))
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
            <Checkbox checked={values.includes(o.value)} onCheckedChange={(on) => toggle(o.value, on)} />
            {o.label}
          </label>
        ))}
      </div>
      {preset && (
        <Hint preset={preset.length ? preset.map((p) => options.find((o) => o.value === p)?.label ?? p).join(', ') : 'ninguno'} />
      )}
    </div>
  )
}

export function ListEditor({
  label, values, onChange, placeholder,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={values.join(', ')}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))}
      />
      <span className="text-[11px] text-muted-foreground">Separa los valores con comas.</span>
    </div>
  )
}

export function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}
