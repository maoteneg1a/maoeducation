import { Label } from '@/shared/components/ui/label'
import { Input } from '@/shared/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'

export interface DynamicField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date'
  required?: boolean
  options?: string[]
  placeholder?: string
}

export interface DynamicSection {
  title: string
  fields: DynamicField[]
}

export interface DynamicSchema {
  sections: DynamicSection[]
}

interface DynamicFormProps {
  schema: DynamicSchema
  values: Record<string, unknown>
  onChange: (key: string, value: unknown) => void
  disabled?: boolean
}

export function DynamicForm({ schema, values, onChange, disabled }: DynamicFormProps) {
  return (
    <div className="space-y-6">
      {schema.sections.map((section) => (
        <div key={section.title} className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 border-b pb-1">{section.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {section.fields.map((f) => (
              <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2 space-y-1.5' : 'space-y-1.5'}>
                {f.type !== 'checkbox' && (
                  <Label htmlFor={f.key}>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                  </Label>
                )}

                {f.type === 'text' && (
                  <Input
                    id={f.key}
                    value={(values[f.key] as string) ?? ''}
                    disabled={disabled}
                    placeholder={f.placeholder}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                )}

                {f.type === 'date' && (
                  <Input
                    id={f.key}
                    type="date"
                    value={(values[f.key] as string) ?? ''}
                    disabled={disabled}
                    onChange={(e) => onChange(f.key, e.target.value)}
                  />
                )}

                {f.type === 'textarea' && (
                  <textarea
                    id={f.key}
                    rows={2}
                    value={(values[f.key] as string) ?? ''}
                    disabled={disabled}
                    placeholder={f.placeholder}
                    onChange={(e) => onChange(f.key, e.target.value)}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
                  />
                )}

                {f.type === 'select' && (
                  <Select
                    value={(values[f.key] as string) ?? ''}
                    onValueChange={(v) => onChange(f.key, v)}
                    disabled={disabled}
                  >
                    <SelectTrigger id={f.key}>
                      <SelectValue placeholder="Seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {f.type === 'checkbox' && (
                  <label className="flex items-center gap-2 text-sm pt-5">
                    <input
                      id={f.key}
                      type="checkbox"
                      className="h-4 w-4"
                      checked={Boolean(values[f.key])}
                      disabled={disabled}
                      onChange={(e) => onChange(f.key, e.target.checked)}
                    />
                    {f.label}
                  </label>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
