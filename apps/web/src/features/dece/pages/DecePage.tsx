import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  CONCERN_LABELS,
  deceApi,
  formatDate,
  protectedQuery,
  STATE_LABELS,
  useDeceContext,
  useDeceIdentity,
  type Receipt,
  type ReportInput,
} from '../api/dece.api'

function ReportForm({ onCreated }: { onCreated: () => void }) {
  const identity = useDeceIdentity()
  const contacts = useQuery({
    queryKey: ['dece', identity, 'contacts'],
    queryFn: deceApi.contacts,
    ...protectedQuery,
  })
  const initial = (): ReportInput => ({
    requestId: crypto.randomUUID(),
    concern: 'other',
    immediateDanger: 'unknown',
    affectedPerson: '',
    narrative: '',
    location: '',
    safeContact: '',
    excludedUserIds: [],
    privacyAcknowledged: false,
  })
  const [report, setReport] = useState<ReportInput>(initial)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const patch = (value: Partial<ReportInput>) => setReport((current) => ({ ...current, ...value }))
  const submit = useMutation({
    mutationFn: deceApi.report,
    onSuccess: (data) => {
      setReceipt(data)
      setReport(initial())
      onCreated()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  if (receipt)
    return (
      <div className="space-y-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
        <p className="font-semibold">Tu alerta se registró.</p>
        <p className="text-sm">
          Referencia: <span className="break-all font-mono">{receipt.id}</span>
        </p>
        <p className="text-sm">
          La confirmación acredita la recepción digital. Si hay peligro inmediato, solicita atención
          urgente por los canales competentes.
        </p>
        <Button type="button" variant="outline" onClick={() => setReceipt(null)}>
          Registrar otra preocupación
        </Button>
      </div>
    )
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!submit.isPending) submit.mutate(report)
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="dece-concern">Tipo de preocupación</Label>
          <select
            id="dece-concern"
            className="h-10 w-full rounded-md border bg-background px-2"
            value={report.concern}
            onChange={(e) => patch({ concern: e.target.value })}
          >
            {Object.entries(CONCERN_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="dece-danger">¿Existe peligro inmediato?</Label>
          <select
            id="dece-danger"
            className="h-10 w-full rounded-md border bg-background px-2"
            value={report.immediateDanger}
            onChange={(e) => patch({ immediateDanger: e.target.value })}
          >
            <option value="unknown">No sé</option>
            <option value="yes">Sí</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      {report.immediateDanger !== 'no' && (
        <p
          role="status"
          className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          Si la persona está en peligro, busca protección y atención urgente. No esperes una
          respuesta de la plataforma para pedir ayuda.
        </p>
      )}
      <div className="space-y-1">
        <Label htmlFor="dece-affected">¿Quién necesita ayuda?</Label>
        <Input
          id="dece-affected"
          required
          maxLength={250}
          placeholder="Puedes indicar que eres tú o describir brevemente a la persona."
          value={report.affectedPerson}
          onChange={(e) => patch({ affectedPerson: e.target.value })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="dece-date">Fecha aproximada (opcional)</Label>
          <Input
            id="dece-date"
            type="date"
            value={report.occurredOn ?? ''}
            onChange={(e) => patch({ occurredOn: e.target.value || undefined })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="dece-location">Lugar aproximado (opcional)</Label>
          <Input
            id="dece-location"
            maxLength={250}
            value={report.location}
            onChange={(e) => patch({ location: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="dece-narrative">Cuéntanos brevemente qué te preocupa</Label>
        <textarea
          id="dece-narrative"
          className="w-full rounded-md border bg-background p-3 text-sm"
          rows={4}
          minLength={10}
          maxLength={8000}
          required
          value={report.narrative}
          onChange={(e) => patch({ narrative: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          Escribe en tus palabras. No necesitas investigar, identificar un protocolo ni describir
          detalles íntimos. Este canal no solicita fotografías ni archivos.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="dece-contact">Forma segura de contactarte (opcional)</Label>
        <Input
          id="dece-contact"
          maxLength={500}
          placeholder="Indica el medio y momento en que es seguro contactarte."
          value={report.safeContact}
          onChange={(e) => patch({ safeContact: e.target.value })}
        />
      </div>
      <fieldset className="space-y-2 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Conflicto de interés (opcional)</legend>
        <p className="text-xs text-muted-foreground">
          Si una de estas personas está implicada o recibir el reporte podría ponerte en riesgo,
          selecciónala para excluirla de este expediente.
        </p>
        {contacts.isError ? (
          <Button type="button" variant="outline" onClick={() => contacts.refetch()}>
            Reintentar carga de responsables
          </Button>
        ) : contacts.isPending ? (
          <p className="text-xs">Cargando responsables…</p>
        ) : (
          contacts.data?.map((user) => (
            <label key={user.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={report.excludedUserIds.includes(user.id)}
                onChange={(e) =>
                  patch({
                    excludedUserIds: e.target.checked
                      ? [...report.excludedUserIds, user.id]
                      : report.excludedUserIds.filter((id) => id !== user.id),
                  })
                }
              />
              {user.name}
            </label>
          ))
        )}
      </fieldset>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          className="mt-1"
          checked={report.privacyAcknowledged}
          onChange={(e) => patch({ privacyAcknowledged: e.target.checked })}
        />
        <span>
          Entiendo que mi cuenta identifica el reporte y que su contenido será consultado por
          responsables autorizados para su atención. No es un reporte anónimo ni sustituye una
          denuncia o atención de emergencia.
        </span>
      </label>
      <Button
        type="submit"
        loading={submit.isPending}
        disabled={
          !report.privacyAcknowledged ||
          !contacts.data ||
          report.narrative.trim().length < 10 ||
          !report.affectedPerson.trim()
        }
      >
        Enviar alerta confidencial
      </Button>
    </form>
  )
}

export function DecePage() {
  const context = useDeceContext()
  const identity = useDeceIdentity()
  const qc = useQueryClient()
  const cases = useQuery({
    queryKey: ['dece', identity, 'cases'],
    queryFn: deceApi.cases,
    enabled: !!context.data?.hasAssignments,
    ...protectedQuery,
    refetchInterval: 30_000,
  })
  const receipts = useQuery({
    queryKey: ['dece', identity, 'receipts'],
    queryFn: deceApi.receipts,
    enabled: !!context.data,
    ...protectedQuery,
  })
  if (context.isError)
    return (
      <div className="p-6">
        <p>{getErrorMessage(context.error)}</p>
        <Button variant="outline" onClick={() => context.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  if (!context.data) return <div className="p-6">Cargando módulo DECE…</div>
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck className="h-6 w-6" />
            Rutas y protocolos DECE
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Comunica preocupaciones y da seguimiento a los expedientes autorizados.
          </p>
        </div>
        {context.data.canConfigure && (
          <Button variant="outline" asChild>
            <Link to="/settings/dece">Configurar módulo</Link>
          </Button>
        )}
      </div>
      <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="space-y-2 text-sm">
          <p className="font-semibold">La protección y la atención urgente tienen prioridad.</p>
          <p>
            El registro digital no sustituye las actuaciones de las autoridades competentes ni
            confirma una denuncia externa.
          </p>
          {context.data.alternativeContact && (
            <p className="whitespace-pre-wrap">
              <strong>Canal alternativo:</strong> {context.data.alternativeContact}
            </p>
          )}
        </div>
      </div>
      {!context.data.canReport && (
        <p className="rounded-md border p-4 text-sm text-muted-foreground">
          La recepción de nuevos reportes no está habilitada para tu cuenta. Los responsables
          mantienen el seguimiento de los expedientes que tienen asignados.
        </p>
      )}
      {context.data.hasAssignments && (
        <Card>
          <CardHeader>
            <CardTitle>Expedientes autorizados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {cases.isError ? (
              <p role="alert">{getErrorMessage(cases.error)}</p>
            ) : cases.isPending ? (
              <p>Cargando expedientes…</p>
            ) : (
              cases.data?.map((record) => (
                <Link
                  key={record.id}
                  to={`/dece/cases/${record.id}`}
                  className="block rounded-md border p-4 hover:bg-muted/40"
                >
                  <p className="font-medium">{STATE_LABELS[record.status] ?? record.status}</p>
                  {record.urgency === 'yes' && (
                    <p className="mt-1 text-sm font-medium text-red-700">
                      Peligro inmediato indicado por el reportante
                    </p>
                  )}
                  {record.urgency === 'unknown' && (
                    <p className="mt-1 text-xs text-amber-800">Urgencia por determinar</p>
                  )}
                  <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                    {record.id}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Actualizado: {formatDate(record.updatedAt)}
                  </p>
                </Link>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Se muestran los 100 expedientes autorizados con actualización más reciente.
            </p>
          </CardContent>
        </Card>
      )}
      {context.data.canReport && (
        <Card>
          <CardHeader>
            <CardTitle>Reportar una preocupación</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportForm
              onCreated={() => {
                qc.invalidateQueries({ queryKey: ['dece'] })
              }}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Confirmaciones de mis reportes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {receipts.isError ? (
            <p>{getErrorMessage(receipts.error)}</p>
          ) : receipts.isPending ? (
            <p>Cargando confirmaciones…</p>
          ) : !receipts.data?.length ? (
            <p className="text-sm text-muted-foreground">Aún no tienes reportes registrados.</p>
          ) : (
            receipts.data.map((receipt) => (
              <div key={receipt.id} className="rounded-md border p-3 text-sm">
                <p>Recepción registrada · {formatDate(receipt.createdAt)}</p>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                  {receipt.id}
                </p>
              </div>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            Últimas 100 confirmaciones. Por protección de las personas involucradas, esta sección
            muestra únicamente la referencia y la fecha de recepción.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
