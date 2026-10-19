import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  ACTION_LABELS,
  CONCERN_LABELS,
  deceApi,
  formatDate,
  protectedQuery,
  STATE_LABELS,
  useDeceIdentity,
} from '../api/dece.api'

const selectClass = 'h-10 w-full rounded-md border bg-background px-2 text-sm'
const textClass = 'w-full rounded-md border bg-background p-3 text-sm'
const auditLabels: Record<string, string> = {
  report_created: 'Alerta registrada',
  case_read: 'Expediente consultado',
  access_read: 'Participantes consultados',
  audit_read: 'Auditoría consultada',
  ...ACTION_LABELS,
}

export function DeceCasePage() {
  const { id = '' } = useParams()
  const identity = useDeceIdentity()
  const qc = useQueryClient()
  const [tab, setTab] = useState('summary')
  const [type, setType] = useState('note')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('')
  const [reason, setReason] = useState('')
  const [target, setTarget] = useState('')
  const [access, setAccess] = useState('viewer')
  const [accessReason, setAccessReason] = useState('')
  useEffect(() => {
    setTab('summary')
    setDescription('')
    setReason('')
    setTarget('')
    setAccessReason('')
    setStatus('')
    setType('note')
  }, [id, identity])
  const query = useQuery({
    queryKey: ['dece', identity, 'case', id],
    queryFn: () => deceApi.detail(id),
    ...protectedQuery,
    refetchInterval: 30_000,
  })
  const manager = !query.isError && query.data?.access === 'manager'
  const members = useQuery({
    queryKey: ['dece', identity, 'access', id],
    queryFn: () => deceApi.access(id),
    enabled: manager && tab === 'access',
    ...protectedQuery,
    refetchInterval: 30_000,
  })
  const audit = useQuery({
    queryKey: ['dece', identity, 'audit', id],
    queryFn: () => deceApi.audit(id),
    enabled: manager && tab === 'audit',
    ...protectedQuery,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['dece'] })
  const action = useMutation({
    mutationFn: () => deceApi.action(id, { type, description }),
    onSuccess: () => {
      setDescription('')
      toast.success('Actuación registrada')
      refresh()
    },
    onError: (e) => {
      toast.error(getErrorMessage(e))
      refresh()
    },
  })
  const change = useMutation({
    mutationFn: () => deceApi.status(id, { status, reason }),
    onSuccess: () => {
      setReason('')
      setStatus('')
      toast.success('Estado interno actualizado')
      refresh()
    },
    onError: (e) => {
      toast.error(getErrorMessage(e))
      refresh()
    },
  })
  const grant = useMutation({
    mutationFn: () => deceApi.grant(id, { userId: target, access, reason: accessReason }),
    onSuccess: () => {
      setTarget('')
      setAccessReason('')
      toast.success('Acceso actualizado')
      refresh()
    },
    onError: (e) => {
      toast.error(getErrorMessage(e))
      refresh()
    },
  })
  const revoke = useMutation({
    mutationFn: ({ userId, exclude }: { userId: string; exclude: boolean }) =>
      deceApi.revoke(id, { userId, reason: accessReason }, exclude),
    onSuccess: () => {
      setAccessReason('')
      setTarget('')
      toast.success('Acceso retirado')
      refresh()
    },
    onError: (e) => {
      toast.error(getErrorMessage(e))
      refresh()
    },
  })
  if (query.isError)
    return (
      <div className="space-y-4 p-6">
        <Button variant="outline" asChild>
          <Link to="/dece">Volver a DECE</Link>
        </Button>
        <p role="alert">{getErrorMessage(query.error)}</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  if (!query.data) return <div className="p-6">Abriendo expediente protegido…</div>
  const record = query.data
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Button variant="ghost" asChild>
        <Link to="/dece">← Rutas y protocolos DECE</Link>
      </Button>
      <div>
        <h1 className="text-2xl font-bold">Expediente confidencial</h1>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{record.id}</p>
        <p className="mt-2 text-sm">
          {STATE_LABELS[record.status] ?? record.status} ·{' '}
          {manager ? 'Gestión autorizada' : 'Consulta autorizada'}
        </p>
      </div>
      <p className="rounded-md border bg-muted/30 p-4 text-sm">
        Este espacio documenta actuaciones y seguimiento interno. Aplica la ruta oficial
        correspondiente y solicita atención urgente cuando proceda. El cierre administrativo interno
        no concluye procesos externos.
      </p>
      <nav aria-label="Secciones del expediente" className="flex flex-wrap gap-2">
        {[
          ['summary', 'Resumen'],
          ['timeline', 'Bitácora'],
          ...(manager
            ? [
                ['access', 'Participantes y accesos'],
                ['audit', 'Auditoría'],
              ]
            : []),
        ].map(([key, label]) => (
          <Button
            key={key}
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {tab === 'summary' && (
        <>
          {record.report.immediateDanger !== 'no' && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
              {record.report.immediateDanger === 'yes'
                ? 'El reportante indicó peligro inmediato.'
                : 'El reportante no pudo determinar si existe peligro inmediato.'}{' '}
              Prioriza la protección y la atención competente.
            </p>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Alerta recibida</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Reportado por</dt>
                  <dd className="mt-1">{record.report.reporterName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Persona que necesita ayuda</dt>
                  <dd className="mt-1 whitespace-pre-wrap">{record.report.affectedPerson}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Tipo de preocupación</dt>
                  <dd className="mt-1">
                    {CONCERN_LABELS[record.report.concern] ?? record.report.concern}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fecha aproximada</dt>
                  <dd className="mt-1">{record.report.occurredOn ?? 'No indicada'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Lugar aproximado</dt>
                  <dd className="mt-1 whitespace-pre-wrap">
                    {record.report.location || 'No indicado'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recepción digital</dt>
                  <dd className="mt-1">{formatDate(record.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contacto seguro indicado</dt>
                  <dd className="mt-1 whitespace-pre-wrap">
                    {record.report.safeContact || 'No indicado'}
                  </dd>
                </div>
              </dl>
              <div>
                <h3 className="font-medium">Relato del reportante</h3>
                <p className="mt-2 whitespace-pre-wrap break-words leading-relaxed">
                  {record.report.narrative}
                </p>
              </div>
            </CardContent>
          </Card>
          {manager && (
            <Card>
              <CardHeader>
                <CardTitle>Actualizar seguimiento interno</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!change.isPending) change.mutate()
                  }}
                >
                  <Label htmlFor="case-state">Nuevo estado</Label>
                  <select
                    id="case-state"
                    required
                    className={selectClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="">Selecciona un estado</option>
                    {Object.entries(STATE_LABELS)
                      .filter(([key]) => key !== record.status)
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                  <Label htmlFor="case-state-reason">
                    Actuaciones verificadas y motivo del cambio
                  </Label>
                  <textarea
                    id="case-state-reason"
                    className={textClass}
                    rows={3}
                    required
                    minLength={5}
                    maxLength={4000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Los cambios quedan en la bitácora. Puedes reabrir el seguimiento dejando
                    constancia del motivo.
                  </p>
                  <Button
                    type="submit"
                    loading={change.isPending}
                    disabled={!status || reason.trim().length < 5}
                  >
                    {status === 'internal_closed'
                      ? 'Registrar cierre administrativo interno'
                      : 'Actualizar estado'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {tab === 'timeline' && (
        <Card>
          <CardHeader>
            <CardTitle>Bitácora de actuaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ol className="space-y-4 border-l pl-4">
              {record.actions.map((entry) => (
                <li key={entry.id}>
                  <p className="font-medium">{ACTION_LABELS[entry.type] ?? entry.type}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(entry.createdAt)} · {entry.actorName}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">
                    {entry.description}
                  </p>
                </li>
              ))}
              {!record.actions.length && (
                <li className="text-sm text-muted-foreground">
                  Sin actuaciones registradas todavía.
                </li>
              )}
            </ol>
            {manager && record.status !== 'internal_closed' && (
              <form
                className="space-y-3 border-t pt-4"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!action.isPending) action.mutate()
                }}
              >
                <Label htmlFor="case-action-type">Tipo de actuación</Label>
                <select
                  id="case-action-type"
                  className={selectClass}
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {['note', 'protection', 'referral', 'follow_up'].map((key) => (
                    <option key={key} value={key}>
                      {ACTION_LABELS[key]}
                    </option>
                  ))}
                </select>
                <Label htmlFor="case-action">Descripción de lo realizado</Label>
                <textarea
                  id="case-action"
                  className={textClass}
                  required
                  rows={4}
                  maxLength={8000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === 'referral'
                      ? 'Indica destino, fecha, medio y referencia de la derivación realizada. Registrar esta nota no envía una denuncia.'
                      : 'Registra la actuación, responsables y observaciones necesarias.'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Las correcciones se registran como nuevas notas para conservar el historial.
                </p>
                <Button type="submit" disabled={!description.trim()} loading={action.isPending}>
                  Registrar actuación
                </Button>
              </form>
            )}
            {manager && record.status === 'internal_closed' && (
              <p className="text-sm text-muted-foreground">
                Reabre el seguimiento desde Resumen para registrar nuevas actuaciones.
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {manager && tab === 'access' && (
        <Card>
          <CardHeader>
            <CardTitle>Participantes y accesos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {members.isError ? (
              <p role="alert">{getErrorMessage(members.error)}</p>
            ) : !members.data ? (
              <p>Cargando participantes…</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  La consulta permite leer el expediente y la bitácora. La gestión también permite
                  documentar actuaciones y administrar accesos. Un participante excluido no puede
                  recibir nuevos permisos.
                </p>
                <ul className="space-y-2">
                  {members.data.members.map((member) => (
                    <li key={member.userId} className="rounded-md border p-3 text-sm">
                      {member.name} · {member.access === 'manager' ? 'Gestión' : 'Consulta'}
                    </li>
                  ))}
                </ul>
                {!!members.data.exclusions.length && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Excluidos por conflicto de interés
                    </h3>
                    <ul className="space-y-1 text-sm">
                      {members.data.exclusions.map((user) => (
                        <li key={user.userId}>{user.name}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <form
                  className="space-y-3 border-t pt-4"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!grant.isPending) grant.mutate()
                  }}
                >
                  <Label htmlFor="case-participant">Responsable</Label>
                  <select
                    id="case-participant"
                    required
                    className={selectClass}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Selecciona responsable</option>
                    {members.data.candidates
                      .filter(
                        (user) =>
                          !members.data!.exclusions.some((entry) => entry.userId === user.id),
                      )
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    {members.data.members
                      .filter(
                        (member) =>
                          !members.data!.candidates.some((user) => user.id === member.userId),
                      )
                      .map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name} (no activo)
                        </option>
                      ))}
                  </select>
                  <Label htmlFor="case-access">Nivel de acceso</Label>
                  <select
                    id="case-access"
                    className={selectClass}
                    value={access}
                    onChange={(e) => setAccess(e.target.value)}
                  >
                    <option value="viewer">Consulta del expediente</option>
                    <option value="manager">Gestión del expediente</option>
                  </select>
                  <Label htmlFor="case-access-reason">
                    Justificación de la autorización, revocación o exclusión
                  </Label>
                  <textarea
                    id="case-access-reason"
                    required
                    minLength={5}
                    maxLength={1000}
                    className={textClass}
                    rows={3}
                    value={accessReason}
                    onChange={(e) => setAccessReason(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="submit"
                      loading={grant.isPending}
                      disabled={!target || accessReason.trim().length < 5 || revoke.isPending}
                    >
                      Autorizar acceso
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !target ||
                        accessReason.trim().length < 5 ||
                        grant.isPending ||
                        revoke.isPending ||
                        !members.data.members.some((user) => user.userId === target)
                      }
                      onClick={() => revoke.mutate({ userId: target, exclude: false })}
                    >
                      Revocar acceso
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={
                        !target ||
                        accessReason.trim().length < 5 ||
                        grant.isPending ||
                        revoke.isPending
                      }
                      onClick={() => revoke.mutate({ userId: target, exclude: true })}
                    >
                      Excluir por conflicto de interés
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Antes de retirar al último gestor debes autorizar a otro responsable. Las
                    exclusiones se conservan durante todo el expediente.
                  </p>
                </form>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {manager && tab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle>Auditoría de acceso y actuaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.isError ? (
              <p>{getErrorMessage(audit.error)}</p>
            ) : !audit.data ? (
              <p>Cargando auditoría…</p>
            ) : (
              audit.data.map((entry) => (
                <div key={entry.id} className="border-b pb-3 text-sm">
                  <p>{auditLabels[entry.action] ?? entry.action}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(entry.createdAt)} ·{' '}
                    {entry.actor.profile
                      ? `${entry.actor.profile.firstName} ${entry.actor.profile.lastName}`
                      : 'Usuario registrado'}
                  </p>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Últimos 200 eventos. Las consultas también quedan registradas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
