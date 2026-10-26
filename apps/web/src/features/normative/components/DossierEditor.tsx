import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  DOSSIER_SOURCE_LABEL,
  SUBNIVEL_LABEL,
  type AttachmentCategory,
  type DossierItem,
  type DossierSource,
  type ReportsFlowConfig,
  type SubnivelCode,
} from '../api/normative.api'
import { CheckField, CheckGroup, NumField, SelectField } from './form-bits'

const MIME_OPTIONS = [
  { value: 'application/pdf', label: 'PDF' },
  { value: 'image/jpeg', label: 'JPG' },
  { value: 'image/png', label: 'PNG' },
  { value: 'image/webp', label: 'WEBP' },
]
const slug = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60)

function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir
  if (j < 0 || j >= list.length) return list
  const next = [...list]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function DossierEditor({
  config, onChange, roles, defaults,
}: {
  config: ReportsFlowConfig
  onChange: (c: ReportsFlowConfig) => void
  roles: Array<{ name: string; label: string }>
  defaults: ReportsFlowConfig
}) {
  const d = config.dossier
  const a = config.attachments
  const staffRoles = roles.filter((r) => r.name !== 'guardian' && r.name !== 'student')
  const roleOptions = staffRoles.map((r) => ({ value: r.name, label: r.label }))
  const reportOptions = config.reportTypes.map((t) => ({ value: t.key, label: t.label }))
  const setDossier = (patch: Partial<typeof d>) => onChange({ ...config, dossier: { ...d, ...patch } })
  const setAttachments = (patch: Partial<typeof a>) => onChange({ ...config, attachments: { ...a, ...patch } })
  const setItem = (i: number, patch: Partial<DossierItem>) => setDossier({ items: d.items.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })
  const setCat = (i: number, patch: Partial<AttachmentCategory>) =>
    setAttachments({ categories: a.categories.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) })

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Checklist de respaldo ante riesgo de reprobar</CardTitle>
              <CardDescription>
                Documentos por estudiante, año y asignatura en seguimiento. Se completan con informes de Auleka o PDF y escaneados. Los documentos con firma requieren su respaldo firmado.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                let n = d.items.length + 1
                while (d.items.some((x) => x.key === `d${n}`)) n++
                setDossier({ items: [...d.items, { key: `d${n}`, label: 'Nuevo documento', source: 'formal_report', reportType: reportOptions[0]?.value, minCount: 1, perSubject: false, optional: false }] })
              }}
            >
              <Plus className="mr-1 h-4 w-4" />Documento
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => setDossier({ items: structuredClone(defaults.dossier.items) })}>Cargar checklist de los 13 documentos</Button>
          <CheckField label="Expediente activo" checked={d.enabled} onChange={(v) => setDossier({ enabled: v })} />
          <CheckGroup
            label="Subniveles a los que aplica (ninguno = todos)"
            options={(Object.keys(SUBNIVEL_LABEL) as SubnivelCode[]).map((s) => ({ value: s, label: SUBNIVEL_LABEL[s] }))}
            values={d.subniveles}
            onChange={(v) => setDossier({ subniveles: v })}
          />
          <div className="space-y-2">
            {d.items.map((it, i) => (
              <div key={i} className="grid items-end gap-2 rounded-md border p-3 md:grid-cols-[2fr_1.5fr_1.5fr_0.7fr_auto]">
                <div className="space-y-1">
                  <Label className="text-xs">Documento</Label>
                  <Input value={it.label} onChange={(e) => setItem(i, { label: e.target.value })} />
                </div>
                <SelectField<DossierSource>
                  label="Se verifica con"
                  value={it.source}
                  onChange={(v) => setItem(i, { source: v, reportType: v === 'formal_report' ? it.reportType ?? reportOptions[0]?.value : undefined })}
                  options={(Object.keys(DOSSIER_SOURCE_LABEL) as DossierSource[]).map((s) => ({ value: s, label: DOSSIER_SOURCE_LABEL[s] }))}
                />
                {it.source === 'formal_report' ? (
                  <SelectField label="Tipo de informe" value={it.reportType ?? ''} onChange={(v) => setItem(i, { reportType: v })} options={reportOptions} />
                ) : <div />}
                <NumField label="Mínimo" integer min={0} value={it.minCount} onChange={(v) => setItem(i, { minCount: v ?? 0 })} />
                <div className="flex">
                  <Button size="icon" variant="ghost" onClick={() => setDossier({ items: move(d.items, i, -1) })}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDossier({ items: move(d.items, i, 1) })}><ArrowDown className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDossier({ items: d.items.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1 md:col-span-5">
                  <CheckField label="Por asignatura en seguimiento" checked={it.perSubject} onChange={(v) => setItem(i, { perSubject: v })} />
                  <CheckField label="Si corresponde (permite justificar que no aplica)" checked={it.optional} onChange={(v) => setItem(i, { optional: v })} />
                  <CheckField label="Requiere respaldo firmado" checked={it.requiresSignature === true} onChange={(v) => setItem(i, { requiresSignature: v })} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Archivos adjuntos</CardTitle>
          <CardDescription>
            Evidencias que el personal sube a los casos de refuerzo y a los informes. Los representantes y estudiantes nunca pueden subir archivos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs">
            <NumField label="Tamaño máximo por archivo (MB, 1–10)" integer min={1} max={10} value={a.maxSizeMb} onChange={(v) => setAttachments({ maxSizeMb: Math.min(10, Math.max(1, v ?? 1)) })} />
          </div>
          <CheckGroup label="Tipos de archivo permitidos" options={MIME_OPTIONS} values={a.allowedMime} onChange={(v) => setAttachments({ allowedMime: v })} />
          <CheckGroup label="Roles que pueden subir archivos" options={roleOptions} values={a.uploaderRoles.filter((r) => r !== 'guardian' && r !== 'student')} onChange={(v) => setAttachments({ uploaderRoles: v })} />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Categorías</Label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  let n = a.categories.length + 1
                  while (a.categories.some((c) => c.key === `categoria_${n}`)) n++
                  setAttachments({ categories: [...a.categories, { key: `categoria_${n}`, label: 'Nueva categoría', visibleToRoles: [] }] })
                }}
              >
                <Plus className="mr-1 h-4 w-4" />Categoría
              </Button>
            </div>
            {a.categories.map((c, i) => (
              <div key={i} className="space-y-2 rounded-md border p-3">
                <div className="grid items-end gap-2 md:grid-cols-[1fr_2fr_auto]">
                  <div className="space-y-1">
                    <Label className="text-xs">Clave</Label>
                    <Input value={c.key} onChange={(e) => setCat(i, { key: slug(e.target.value) })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre</Label>
                    <Input value={c.label} onChange={(e) => setCat(i, { label: e.target.value })} />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => setAttachments({ categories: a.categories.filter((_, idx) => idx !== i) })}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
                <CheckGroup
                  label="Visible solo para (además de quien lo subió). Vacío = todo el personal con acceso al caso"
                  options={roleOptions}
                  values={c.visibleToRoles}
                  onChange={(v) => setCat(i, { visibleToRoles: v })}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
