import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  RESOLVER_LABEL,
  SCOPE_LABEL,
  SNAPSHOT_LABEL,
  type InstanceResolver,
  type InstitutionUserOption,
  type ReportField,
  type ReportInstance,
  type ReportScope,
  type ReportSnapshotSource,
  type ReportTypeConfig,
  type ReportsFlowConfig,
} from '../api/normative.api'
import { CheckField, CheckGroup, FieldGrid, ListEditor, NumField, SelectField } from './form-bits'

const NONE = '__none__'
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

interface Props {
  config: ReportsFlowConfig
  onChange: (c: ReportsFlowConfig) => void
  roles: Array<{ name: string; label: string }>
  users: InstitutionUserOption[]
  /** Claves que ya existían al cargar (no se pueden renombrar). */
  savedTypeKeys: Set<string>
  savedInstanceKeys: Set<string>
}

export function ReportsFlowEditor({ config, onChange, roles, users, savedTypeKeys, savedInstanceKeys }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const instanceOptions = config.instances.map((i) => ({ value: i.key, label: i.label || i.key }))
  const staffRoles = roles.filter((r) => r.name !== 'guardian' && r.name !== 'student')

  const setInstance = (idx: number, patch: Partial<ReportInstance>) =>
    onChange({ ...config, instances: config.instances.map((x, i) => (i === idx ? { ...x, ...patch } : x)) })
  const setType = (idx: number, patch: Partial<ReportTypeConfig>) =>
    onChange({ ...config, reportTypes: config.reportTypes.map((x, i) => (i === idx ? { ...x, ...patch } : x)) })

  const addInstance = () => {
    let n = config.instances.length + 1
    while (config.instances.some((i) => i.key === `instancia_${n}`)) n++
    onChange({ ...config, instances: [...config.instances, { key: `instancia_${n}`, label: 'Nueva instancia', resolver: 'role', role: staffRoles[0]?.name }] })
  }

  const newType = (base?: ReportTypeConfig): ReportTypeConfig => {
    let n = config.reportTypes.length + 1
    const prefix = base ? `${base.key}_copia` : 'informe'
    while (config.reportTypes.some((t) => t.key === `${prefix}_${n}`)) n++
    return base
      ? { ...structuredClone(base), key: `${prefix}_${n}`, label: `${base.label} (copia)` }
      : {
          key: `${prefix}_${n}`, label: 'Nuevo informe', enabled: true, scope: 'student', authorRoles: ['teacher'],
          to: config.instances[0]?.key ?? '', triggeredByAlert: false, requiresReinforcementCase: false, snapshot: 'none',
          fields: [{ key: 'contenido', label: 'Contenido', type: 'textarea', required: true }], ackDeadlineDays: 3,
          escalateTo: null, confidential: false, canDeriveTo: [], pdfTitle: 'INFORME', signatures: ['Elaborado por', 'Recibido por'],
        }
  }
  const addType = (base?: ReportTypeConfig) => {
    const t = newType(base)
    onChange({ ...config, reportTypes: [...config.reportTypes, t] })
    setOpen(t.key)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Folio</CardTitle>
          <CardDescription>Prefijo del número correlativo que recibe cada informe al enviarse (ej. INF-2026-2027-00012).</CardDescription>
        </CardHeader>
        <CardContent>
          <Input className="max-w-xs" value={config.folioPrefix} onChange={(e) => onChange({ ...config, folioPrefix: e.target.value.toUpperCase().slice(0, 12) })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Instancias de la escuela</CardTitle>
              <CardDescription>A quién se envían los informes y cómo se resuelven sus usuarios en cada caso.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={addInstance}><Plus className="mr-1 h-4 w-4" />Instancia</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.instances.map((inst, idx) => (
            <div key={idx} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_1.5fr_1.5fr_1.5fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Clave</Label>
                <Input value={inst.key} disabled={savedInstanceKeys.has(inst.key)} onChange={(e) => setInstance(idx, { key: slug(e.target.value) })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nombre</Label>
                <Input value={inst.label} onChange={(e) => setInstance(idx, { label: e.target.value })} />
              </div>
              <SelectField<InstanceResolver>
                label="Quiénes la integran"
                value={inst.resolver}
                onChange={(v) => setInstance(idx, { resolver: v })}
                options={(Object.keys(RESOLVER_LABEL) as InstanceResolver[]).map((r) => ({ value: r, label: RESOLVER_LABEL[r] }))}
              />
              <div className="space-y-1">
                {inst.resolver === 'role' && (
                  <>
                    <Label className="text-xs">Rol</Label>
                    <Select value={inst.role ?? NONE} onValueChange={(v) => setInstance(idx, { role: v === NONE ? undefined : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Selecciona un rol</SelectItem>
                        {staffRoles.map((r) => <SelectItem key={r.name} value={r.name}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </>
                )}
                {inst.resolver === 'users' && (
                  <UserPicker users={users} value={inst.userIds ?? []} onChange={(userIds) => setInstance(idx, { userIds })} />
                )}
              </div>
              <div className="flex items-end">
                <Button
                  size="icon"
                  variant="ghost"
                  title="Eliminar instancia"
                  onClick={() => onChange({ ...config, instances: config.instances.filter((_, i) => i !== idx) })}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Tipos de informe</CardTitle>
              <CardDescription>Qué informes existen, quién los redacta, a qué instancia van, plazos, campos y PDF.</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => addType()}><Plus className="mr-1 h-4 w-4" />Informe</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {config.reportTypes.map((t, idx) => {
            const isOpen = open === t.key
            return (
              <div key={idx} className="rounded-md border">
                <div className="flex items-center gap-2 p-3">
                  <button type="button" className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen(isOpen ? null : t.key)}>
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{t.label}</span>
                    <span className="text-xs text-muted-foreground">→ {config.instances.find((i) => i.key === t.to)?.label ?? t.to}</span>
                    {!t.enabled && <Badge variant="secondary">Desactivado</Badge>}
                    {t.confidential && <Badge variant="warning">Confidencial</Badge>}
                    {t.triggeredByAlert && <Badge variant="outline">Alerta</Badge>}
                  </button>
                  <Button size="icon" variant="ghost" title="Subir" onClick={() => onChange({ ...config, reportTypes: move(config.reportTypes, idx, -1) })}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Bajar" onClick={() => onChange({ ...config, reportTypes: move(config.reportTypes, idx, 1) })}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Duplicar" onClick={() => addType(t)}><Copy className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" title="Eliminar" onClick={() => onChange({ ...config, reportTypes: config.reportTypes.filter((_, i) => i !== idx) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                {isOpen && (
                  <ReportTypeForm
                    type={t}
                    onChange={(patch) => {
                      setType(idx, patch)
                      if (patch.key) setOpen(patch.key)
                    }}
                    keyLocked={savedTypeKeys.has(t.key)}
                    instanceOptions={instanceOptions}
                    staffRoles={staffRoles}
                  />
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}

function UserPicker({ users, value, onChange }: { users: InstitutionUserOption[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState('')
  const filtered = users.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50)
  return (
    <div className="space-y-1">
      <Label className="text-xs">Usuarios ({value.length})</Label>
      <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-36 space-y-1 overflow-y-auto rounded border p-2">
        {filtered.map((u) => (
          <CheckField
            key={u.id}
            label={u.fullName}
            description={u.email}
            checked={value.includes(u.id)}
            onChange={(on) => onChange(on ? [...value, u.id] : value.filter((x) => x !== u.id))}
          />
        ))}
        {filtered.length === 0 && <p className="text-xs text-muted-foreground">Sin resultados</p>}
      </div>
    </div>
  )
}

function ReportTypeForm({
  type: t, onChange, keyLocked, instanceOptions, staffRoles,
}: {
  type: ReportTypeConfig
  onChange: (patch: Partial<ReportTypeConfig>) => void
  keyLocked: boolean
  instanceOptions: Array<{ value: string; label: string }>
  staffRoles: Array<{ name: string; label: string }>
}) {
  const authorOptions = [...staffRoles.map((r) => ({ value: r.name, label: r.label })), { value: 'tutor', label: 'Tutor del paralelo' }]
  const setField = (i: number, patch: Partial<ReportField>) =>
    onChange({ fields: t.fields.map((f, idx) => (idx === i ? { ...f, ...patch } : f)) })

  return (
    <div className="space-y-4 border-t p-4">
      <FieldGrid>
        <div className="space-y-1">
          <Label className="text-xs">Clave</Label>
          <Input value={t.key} disabled={keyLocked} onChange={(e) => onChange({ key: slug(e.target.value) })} />
          {keyLocked && <span className="text-[11px] text-muted-foreground">No se puede renombrar: hay informes con esta clave.</span>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Nombre</Label>
          <Input value={t.label} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
      </FieldGrid>
      <div className="space-y-1">
        <Label className="text-xs">Descripción</Label>
        <Textarea rows={2} value={t.description ?? ''} onChange={(e) => onChange({ description: e.target.value })} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <CheckField label="Activo" checked={t.enabled} onChange={(v) => onChange({ enabled: v })} />
        <CheckField label="Lo sugiere una alerta temprana" checked={t.triggeredByAlert} onChange={(v) => onChange({ triggeredByAlert: v })} />
        <CheckField label="Requiere caso de refuerzo" checked={t.requiresReinforcementCase} onChange={(v) => onChange({ requiresReinforcementCase: v })} />
        <CheckField label="Confidencial (solo autor y destinatarios)" checked={t.confidential} onChange={(v) => onChange({ confidential: v })} />
      </div>

      <FieldGrid>
        <SelectField<ReportScope>
          label="Alcance"
          value={t.scope}
          onChange={(v) => onChange({ scope: v })}
          options={(Object.keys(SCOPE_LABEL) as ReportScope[]).map((s) => ({ value: s, label: SCOPE_LABEL[s] }))}
        />
        <SelectField label="Se envía a" value={t.to} onChange={(v) => onChange({ to: v })} options={instanceOptions} />
        <SelectField
          label="Escala a (si vence el plazo)"
          value={t.escalateTo ?? NONE}
          onChange={(v) => onChange({ escalateTo: v === NONE ? null : v })}
          options={[{ value: NONE, label: 'No escala' }, ...instanceOptions]}
        />
        <NumField label="Días para acusar recibo (0 = sin plazo)" integer min={0} max={90} value={t.ackDeadlineDays} onChange={(v) => onChange({ ackDeadlineDays: v ?? 0 })} />
        <SelectField<ReportSnapshotSource>
          label="Datos que agrega el sistema"
          value={t.snapshot}
          onChange={(v) => onChange({ snapshot: v })}
          options={(Object.keys(SNAPSHOT_LABEL) as ReportSnapshotSource[]).map((s) => ({ value: s, label: SNAPSHOT_LABEL[s] }))}
        />
      </FieldGrid>

      <CheckGroup label="Quién puede redactarlo" options={authorOptions} values={t.authorRoles} onChange={(v) => onChange({ authorRoles: v })} />
      <CheckGroup label="El destinatario puede derivarlo a" options={instanceOptions} values={t.canDeriveTo ?? []} onChange={(v) => onChange({ canDeriveTo: v })} />

      <FieldGrid>
        <SelectField
          label="Formato del documento"
          value={t.pdfTemplate ?? NONE}
          onChange={(v) => onChange({ pdfTemplate: v === NONE ? undefined : v as ReportTypeConfig['pdfTemplate'] })}
          options={[
            { value: NONE, label: 'Informe general' },
            { value: 'annex_alerts', label: 'Anexo 1 · Informe a las autoridades' },
            { value: 'annex_commitment', label: 'Anexo 2 · Compromiso familiar' },
            { value: 'annex_plan', label: 'Anexo 3 · Plan individual' },
            { value: 'annex_progress', label: 'Anexo 4 · Avances' },
            { value: 'annex_attendance', label: 'Anexo 5 · Asistencia' },
          ]}
        />
        {!t.pdfTemplate && <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Título del PDF</Label>
          <Input value={t.pdfTitle} onChange={(e) => onChange({ pdfTitle: e.target.value })} />
        </div>}
        {!t.pdfTemplate && <ListEditor label="Firmas" values={t.signatures} onChange={(v) => onChange({ signatures: v })} placeholder="Docente, Representante legal" />}
      </FieldGrid>
      {t.pdfTemplate && <p className="text-sm text-muted-foreground">El anexo conserva los textos, membrete, tablas y firmas del Word original. Los campos siguientes completan sus espacios de datos.</p>}
      {!t.pdfTemplate && <div className="space-y-1">
        <Label className="text-xs">Pie del PDF</Label>
        <Input value={t.pdfFooter ?? ''} onChange={(e) => onChange({ pdfFooter: e.target.value })} />
      </div>}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Campos que redacta el autor</Label>
          {!t.pdfTemplate && <Button
            size="sm"
            variant="outline"
            onClick={() => {
              let n = t.fields.length + 1
              while (t.fields.some((f) => f.key === `campo_${n}`)) n++
              onChange({ fields: [...t.fields, { key: `campo_${n}`, label: 'Nuevo campo', type: 'textarea', required: false }] })
            }}
          >
            <Plus className="mr-1 h-4 w-4" />Campo
          </Button>}
        </div>
        {t.fields.map((f, i) => (
          <div key={i} className="grid items-end gap-2 rounded border p-2 md:grid-cols-[1fr_2fr_1fr_auto_auto]">
            <div className="space-y-1">
              <Label className="text-[11px]">Clave</Label>
              <Input value={f.key} disabled={!!t.pdfTemplate} onChange={(e) => setField(i, { key: slug(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Etiqueta</Label>
              <Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            </div>
            <SelectField
              label="Tipo"
              value={f.type}
              onChange={(v) => setField(i, { type: v })}
              options={[{ value: 'textarea', label: 'Texto largo' }, { value: 'text', label: 'Texto corto' }, { value: 'date', label: 'Fecha' }]}
            />
            <CheckField label="Obligatorio" checked={f.required} onChange={(v) => setField(i, { required: v })} />
            {!t.pdfTemplate && <div className="flex">
              <Button size="icon" variant="ghost" onClick={() => onChange({ fields: move(t.fields, i, -1) })}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => onChange({ fields: move(t.fields, i, 1) })}><ArrowDown className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => onChange({ fields: t.fields.filter((_, idx) => idx !== i) })}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>}
            <div className="space-y-1 md:col-span-5">
              <Label className="text-[11px]">Contenido inicial para nuevos informes (opcional)</Label>
              <Textarea rows={2} value={f.defaultValue ?? ''} onChange={(e) => setField(i, { defaultValue: e.target.value || undefined })} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
