import { useEffect, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Eye } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { PdfPreviewModal } from '@/shared/components/feedback/PdfPreviewModal'
import { apiClient } from '@/shared/lib/api-client'
import { useMicrocurricularTemplate, useUpdateMicrocurricularTemplate } from '../hooks/useSettings'
import type { MicrocurricularTemplateConfig, SaberType } from '../api/settings.api'

const SABER_LABEL: Record<SaberType, string> = {
  declarativo: 'Declarativos',
  procedimental: 'Procedimentales',
  actitudinal: 'Actitudinales',
}

const SECTION_LABEL: Record<string, string> = {
  datos_informativos: 'Datos informativos',
  situacion_aprendizaje: 'Situación de aprendizaje',
  conexion_interdisciplinar: 'Conexión interdisciplinar',
  semanas: 'Semanas',
}

function SortableRow({ id, label, hidden, onToggleHidden }: { id: string; label: string; hidden?: boolean; onToggleHidden?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm ${isDragging ? 'opacity-50' : ''} ${hidden ? 'opacity-50' : ''}`}
    >
      <button type="button" {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="flex-1">{label}</span>
      {onToggleHidden && (
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="h-3.5 w-3.5" checked={!hidden} onChange={onToggleHidden} />
          Visible
        </label>
      )}
    </div>
  )
}

/** Un par fondo+texto editable (color picker + hex) con muestra de contraste en vivo. */
function ColorPairRow({
  title,
  hint,
  bgValue,
  textValue,
  onBgChange,
  onTextChange,
}: {
  title: string
  hint: string
  bgValue: string
  textValue: string
  onBgChange: (v: string) => void
  onTextChange: (v: string) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label>Fondo</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={bgValue} onChange={(e) => onBgChange(e.target.value)} className="h-9 w-12 rounded border" />
            <Input className="w-28" value={bgValue} onChange={(e) => onBgChange(e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Texto</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={textValue} onChange={(e) => onTextChange(e.target.value)} className="h-9 w-12 rounded border" />
            <Input className="w-28" value={textValue} onChange={(e) => onTextChange(e.target.value)} />
          </div>
        </div>
        <div
          className="flex h-9 min-w-32 items-center justify-center rounded border px-3 text-sm font-semibold"
          style={{ backgroundColor: bgValue, color: textValue }}
        >
          Muestra
        </div>
      </div>
    </div>
  )
}

export function MicrocurricularTemplatePage() {
  const { data, isLoading } = useMicrocurricularTemplate()
  const update = useUpdateMicrocurricularTemplate()
  const [cfg, setCfg] = useState<MicrocurricularTemplateConfig | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    if (data) setCfg(structuredClone(data))
  }, [data])

  if (isLoading || !cfg) return <PageLoader />

  function handleSaberesDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !cfg) return
    const oldIndex = cfg.saberesOrder.indexOf(active.id as SaberType)
    const newIndex = cfg.saberesOrder.indexOf(over.id as SaberType)
    setCfg({ ...cfg, saberesOrder: arrayMove(cfg.saberesOrder, oldIndex, newIndex) })
  }

  function handleSectionsDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id || !cfg) return
    const oldIndex = cfg.sectionOrder.indexOf(active.id as string)
    const newIndex = cfg.sectionOrder.indexOf(over.id as string)
    setCfg({ ...cfg, sectionOrder: arrayMove(cfg.sectionOrder, oldIndex, newIndex) })
  }

  function toggleSectionHidden(id: string) {
    if (!cfg) return
    const hidden = cfg.hiddenSections.includes(id)
    setCfg({
      ...cfg,
      hiddenSections: hidden ? cfg.hiddenSections.filter((s) => s !== id) : [...cfg.hiddenSections, id],
    })
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formato de Planificación Microcurricular</h1>
          <p className="text-sm text-muted-foreground">
            Personaliza el PDF que exportan los docentes: colores, marca de agua, nombres de fase y orden de secciones.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>
            <Eye className="h-4 w-4" />
            Vista previa
          </Button>
          <Button onClick={() => update.mutate(cfg)} loading={update.isPending}>
            Guardar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Colores de encabezados</CardTitle>
          <CardDescription>
            3 encabezados independientes: el superior (institución + año lectivo), las bandas de sección
            (Datos informativos, Situación de aprendizaje, SEMANAS...) y los sub-encabezados de tabla
            (Indicadores/Saberes, Estrategias/Recursos/Evaluación, pie de firmas). Cada uno tiene su propio
            color de fondo y de texto.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ColorPairRow
            title="Encabezado superior"
            hint="Nombre de la institución y año lectivo, arriba del documento."
            bgValue={cfg.topHeaderColor}
            textValue={cfg.topHeaderTextColor}
            onBgChange={(v) => setCfg({ ...cfg, topHeaderColor: v })}
            onTextChange={(v) => setCfg({ ...cfg, topHeaderTextColor: v })}
          />
          <ColorPairRow
            title="Bandas de sección"
            hint="Datos informativos, Situación de aprendizaje, Conexión interdisciplinar, SEMANAS, título Saberes."
            bgValue={cfg.headerColor}
            textValue={cfg.headerTextColor}
            onBgChange={(v) => setCfg({ ...cfg, headerColor: v })}
            onTextChange={(v) => setCfg({ ...cfg, headerTextColor: v })}
          />
          <ColorPairRow
            title="Sub-encabezados de tabla"
            hint="Indicadores de evaluación / D-P-A, Estrategias-Recursos-Evaluación, encabezado del pie de firmas."
            bgValue={cfg.headerColor2}
            textValue={cfg.headerColor2TextColor}
            onBgChange={(v) => setCfg({ ...cfg, headerColor2: v })}
            onTextChange={(v) => setCfg({ ...cfg, headerColor2TextColor: v })}
          />
          <p className="max-w-2xl text-xs text-muted-foreground">
            Nota: la tabla semanal del modelo por Competencias (ESTRATEGIAS / RECURSOS / EVALUACIÓN) usa un azul
            marino fijo — es el formato oficial calcado del documento TIGA y no es configurable.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marca de agua</CardTitle>
          <CardDescription>Usa el logo institucional (Configuración → Marca) como marca de agua de fondo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={cfg.watermarkEnabled}
              onChange={(e) => setCfg({ ...cfg, watermarkEnabled: e.target.checked })}
            />
            Mostrar marca de agua en el PDF
          </label>

          {cfg.watermarkEnabled && (
            <div className="max-w-md space-y-4 border-l pl-4">
              <div className="space-y-1.5">
                <Label>Opacidad: {Math.round(cfg.watermarkOpacity * 100)}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(cfg.watermarkOpacity * 100)}
                  onChange={(e) => setCfg({ ...cfg, watermarkOpacity: Number(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Alcance</Label>
                <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
                  <input
                    type="radio"
                    className="mt-0.5 h-4 w-4"
                    checked={cfg.watermarkScope === 'first_page_only'}
                    onChange={() => setCfg({ ...cfg, watermarkScope: 'first_page_only' })}
                  />
                  <span>
                    <span className="font-medium">Solo la primera página</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
                  <input
                    type="radio"
                    className="mt-0.5 h-4 w-4"
                    checked={cfg.watermarkScope === 'all_pages'}
                    onChange={() => setCfg({ ...cfg, watermarkScope: 'all_pages' })}
                  />
                  <span>
                    <span className="font-medium">Todas las páginas</span>
                  </span>
                </label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nombres de las fases pedagógicas</CardTitle>
          <CardDescription>El dato es el mismo (anticipación/construcción/consolidación) — solo cambia la etiqueta que ve el docente.</CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-2xl grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>1ª fase</Label>
            <Input
              value={cfg.phaseLabels.anticipacion}
              onChange={(e) => setCfg({ ...cfg, phaseLabels: { ...cfg.phaseLabels, anticipacion: e.target.value } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>2ª fase</Label>
            <Input
              value={cfg.phaseLabels.construccionConocimiento}
              onChange={(e) => setCfg({ ...cfg, phaseLabels: { ...cfg.phaseLabels, construccionConocimiento: e.target.value } })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>3ª fase</Label>
            <Input
              value={cfg.phaseLabels.consolidacion}
              onChange={(e) => setCfg({ ...cfg, phaseLabels: { ...cfg.phaseLabels, consolidacion: e.target.value } })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orden de los saberes</CardTitle>
          <CardDescription>Arrastra para cambiar el orden de las columnas Declarativos / Procedimentales / Actitudinales.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSaberesDragEnd}>
            <SortableContext items={cfg.saberesOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {cfg.saberesOrder.map((s) => (
                  <SortableRow key={s} id={s} label={SABER_LABEL[s]} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Secciones del documento</CardTitle>
          <CardDescription>Arrastra para reordenar, o desmarca "Visible" para ocultar una sección completa.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleSectionsDragEnd}>
            <SortableContext items={cfg.sectionOrder} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {cfg.sectionOrder.map((id) => (
                  <SortableRow
                    key={id}
                    id={id}
                    label={SECTION_LABEL[id] ?? id}
                    hidden={cfg.hiddenSections.includes(id)}
                    onToggleHidden={() => toggleSectionHidden(id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diseño de semanas</CardTitle>
          <CardDescription>Cómo se presentan las semanas dentro del documento.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md space-y-2">
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
            <input
              type="radio"
              className="mt-0.5 h-4 w-4"
              checked={cfg.weekLayout === 'table_per_week'}
              onChange={() => setCfg({ ...cfg, weekLayout: 'table_per_week' })}
            />
            <span>
              <span className="font-medium">Una tabla completa por semana</span>
              <br />
              <span className="text-xs text-muted-foreground">Cada semana ocupa su propia tabla de metodología (más espaciado, útil para pocas semanas por trimestre).</span>
            </span>
          </label>
          <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
            <input
              type="radio"
              className="mt-0.5 h-4 w-4"
              checked={cfg.weekLayout === 'rows_in_single_table'}
              onChange={() => setCfg({ ...cfg, weekLayout: 'rows_in_single_table' })}
            />
            <span>
              <span className="font-medium">Todas las semanas en una sola tabla</span>
              <br />
              <span className="text-xs text-muted-foreground">Cada semana es una fila — vista compacta de todo el trimestre en menos páginas.</span>
            </span>
          </label>
        </CardContent>
      </Card>

      <PdfPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title="Vista previa del formato"
        fetchPdf={async () => {
          // El preview usa una situación de ejemplo (no persistida) para no requerir
          // que el admin ya tenga planificaciones creadas solo para ver su formato.
          return apiClient.post('institution/document-templates/microcurricular/preview', { json: cfg }).blob()
        }}
      />
    </div>
  )
}
