import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { normativeApi, type ReportsFlowConfig } from '../api/normative.api'
import { FrameworkTab } from '../components/FrameworkTab'
import { RulesForm } from '../components/RulesForm'
import { ReportsFlowEditor } from '../components/ReportsFlowEditor'
import { DossierEditor } from '../components/DossierEditor'

/**
 * Configuración normativa de la institución (Acuerdo MINEDEC-2026-00082-A):
 * marco, reglas del motor de notas, flujo de informes entre instancias,
 * expediente de respaldo y adjuntos. Todo parametrizable por escuela.
 */
export function NormativeSettingsPage() {
  const qc = useQueryClient()
  const profile = useQuery({ queryKey: ['normative-profile'], queryFn: normativeApi.getProfile })
  const flow = useQuery({ queryKey: ['reports-flow'], queryFn: normativeApi.getReportsFlow })
  const users = useQuery({ queryKey: ['normative-users'], queryFn: normativeApi.listUsers, staleTime: 60_000 })
  const [draft, setDraft] = useState<ReportsFlowConfig | null>(null)

  useEffect(() => {
    if (flow.data) setDraft(structuredClone(flow.data.config))
  }, [flow.data])

  const savedTypeKeys = useMemo(() => new Set(flow.data?.config.reportTypes.map((t) => t.key) ?? []), [flow.data])
  const savedInstanceKeys = useMemo(() => new Set(flow.data?.config.instances.map((i) => i.key) ?? []), [flow.data])
  const dirty = !!draft && !!flow.data && JSON.stringify(draft) !== JSON.stringify(flow.data.config)

  const saveFlow = useMutation({
    mutationFn: (c: ReportsFlowConfig) => normativeApi.updateReportsFlow(c),
    onSuccess: (res) => {
      qc.setQueryData(['reports-flow'], res)
      qc.invalidateQueries({ queryKey: ['dossier'] })
      toast.success('Configuración de informes guardada')
    },
    onError: (e) => toast.error(getErrorMessage(e), { duration: 10000 }),
  })
  const resetFlow = useMutation({
    mutationFn: normativeApi.resetReportsFlow,
    onSuccess: (res) => {
      qc.setQueryData(['reports-flow'], res)
      qc.invalidateQueries({ queryKey: ['dossier'] })
      toast.success('Configuración restaurada')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const onReset = async () => {
    const ok = await confirmDialog({
      title: 'Restaurar configuración por defecto',
      description: 'Se reemplazan instancias, tipos de informe, expediente y adjuntos por los valores sugeridos para el Acuerdo 2026-00082-A. Los informes ya enviados no cambian.',
      confirmText: 'Restaurar',
      destructive: true,
    })
    if (ok) resetFlow.mutate()
  }

  const loadAnnexes = () => {
    if (!draft || !flow.data) return
    const next = structuredClone(draft)
    const defaults = flow.data.defaults
    const instance = defaults.instances.find((i) => i.key === 'subdireccion')
    if (instance && !next.instances.some((i) => i.key === instance.key)) next.instances.push(structuredClone(instance))
    for (const type of defaults.reportTypes.filter((t) => t.pdfTemplate)) {
      const index = next.reportTypes.findIndex((t) => t.key === type.key)
      if (index < 0) next.reportTypes.push(structuredClone(type))
      else next.reportTypes[index] = structuredClone(type)
    }
    setDraft(next)
    toast.info('Anexos cargados en el formulario. Revisa responsables y campos antes de guardar.')
  }

  if (profile.isLoading || flow.isLoading || !profile.data || !flow.data || !draft) return <PageLoader />

  const flowActions = (
    <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 py-3">
      <Button variant="outline" onClick={onReset} disabled={resetFlow.isPending}>
        <RotateCcw className="mr-2 h-4 w-4" />Restaurar configuración por defecto
      </Button>
      <div className="flex items-center gap-2">
        {dirty && <span className="text-xs text-amber-700">Hay cambios sin guardar</span>}
        <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(structuredClone(flow.data.config))}>Descartar</Button>
        <Button onClick={() => saveFlow.mutate(draft)} disabled={!dirty || saveFlow.isPending}>
          {saveFlow.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Evaluación normativa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acuerdo MINEDEC-MINEDEC-2026-00082-A: reglas de evaluación, alertas tempranas, refuerzo e informes entre instancias de la escuela.
          Todos los valores son editables por la institución.
        </p>
      </div>
      <Tabs defaultValue="framework">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="framework">Marco normativo</TabsTrigger>
          <TabsTrigger value="rules">Reglas del motor</TabsTrigger>
          <TabsTrigger value="reports">Informes e instancias</TabsTrigger>
          <TabsTrigger value="dossier">Expediente y adjuntos</TabsTrigger>
        </TabsList>
        <TabsContent value="framework" className="mt-4">
          <FrameworkTab data={profile.data} />
        </TabsContent>
        <TabsContent value="rules" className="mt-4">
          <RulesForm data={profile.data} />
        </TabsContent>
        <TabsContent value="reports" className="mt-4 space-y-4">
          <div className="space-y-2 rounded-md border p-4">
            <p className="text-sm font-medium">Los cinco anexos de refuerzo pedagógico</p>
            <p className="text-sm text-muted-foreground">
              Carga informe de alertas a las autoridades (Anexo 1), compromiso familiar, plan individual, avances y asistencia.
              Sustituye esos cinco modelos en este formulario. Guarda para usarlos en nuevos informes.
              En la instancia Subdirección / responsable del refuerzo selecciona las personas correspondientes;
              inicialmente se dirige al rol Rector. Los anexos conservan el membrete, texto, tablas y firmas del Word original.
            </p>
            <Button variant="outline" onClick={loadAnnexes}>Cargar los cinco anexos</Button>
          </div>
          <ReportsFlowEditor
            config={draft}
            onChange={setDraft}
            roles={flow.data.roles}
            users={users.data ?? []}
            savedTypeKeys={savedTypeKeys}
            savedInstanceKeys={savedInstanceKeys}
          />
          {flowActions}
        </TabsContent>
        <TabsContent value="dossier" className="mt-4 space-y-4">
          <DossierEditor config={draft} onChange={setDraft} roles={flow.data.roles} defaults={flow.data.defaults} />
          {flowActions}
        </TabsContent>
      </Tabs>
    </div>
  )
}
