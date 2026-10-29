import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import { deceApi, protectedQuery, useDeceIdentity, type DeceConfig } from '../api/dece.api'

export function DeceSettingsPage() {
  const identity = useDeceIdentity()
  const query = useQuery({
    queryKey: ['dece', identity, 'settings'],
    queryFn: deceApi.settings,
    ...protectedQuery,
  })
  const [config, setConfig] = useState<DeceConfig | null>(null)
  const qc = useQueryClient()
  useEffect(() => {
    if (query.data) {
      const {
        enabled,
        visibleRoles,
        reporterRoles,
        primaryReceiverId,
        alternateReceiverId,
        alternativeContact,
      } = query.data
      setConfig({
        enabled,
        visibleRoles,
        reporterRoles,
        primaryReceiverId,
        alternateReceiverId,
        alternativeContact,
      })
    }
  }, [query.data])
  const save = useMutation({
    mutationFn: deceApi.saveSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dece'] })
      toast.success('Configuración DECE guardada')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  if (query.isError)
    return (
      <div className="p-6">
        <p>{getErrorMessage(query.error)}</p>
        <Button variant="outline" onClick={() => query.refetch()}>
          Reintentar
        </Button>
      </div>
    )
  if (!config || !query.data) return <div className="p-6">Cargando configuración DECE…</div>
  const patch = (value: Partial<DeceConfig>) => setConfig({ ...config, ...value })
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Configuración de rutas y protocolos DECE</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define quién puede reportar y quién recibe las alertas confidenciales.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recepción institucional</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!query.data.platformEnabled && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              Plataforma debe habilitar el módulo para esta institución antes de activar nuevos
              reportes.
            </p>
          )}

          <label className="flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
            />
            Habilitar nuevos reportes
          </label>
          <p className="text-sm text-muted-foreground">
            Al desactivarlos, los responsables conservan el acceso a los expedientes asignados. La
            configuración no concede acceso al contenido de los casos.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['primaryReceiverId', 'alternateReceiverId'] as const).map((key) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key}>
                  {key === 'primaryReceiverId'
                    ? 'Responsable de recepción'
                    : 'Responsable alternativo'}
                </Label>
                <select
                  id={key}
                  className="h-10 w-full rounded-md border bg-background px-2 text-sm"
                  value={config[key] ?? ''}
                  onChange={(e) => patch({ [key]: e.target.value || null })}
                >
                  <option value="">Selecciona responsable</option>
                  {query.data!.staff.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.roles.join(', ')})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Deben ser dos personas distintas, activas y con rol DECE, rector o inspector. Si el
            titular está excluido o inactivo, recibe el alternativo.
          </p>
          <div className="space-y-2">
            <Label htmlFor="alternative-contact">Canal alternativo de atención</Label>
            <textarea
              id="alternative-contact"
              className="w-full rounded-md border bg-background p-3 text-sm"
              rows={3}
              maxLength={1000}
              value={config.alternativeContact}
              onChange={(e) => patch({ alternativeContact: e.target.value })}
              placeholder="Indica la oficina, contacto y horario de la instancia alternativa autorizada."
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Visibilidad y reporte por rol</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-3">Rol</th>
                  <th>Mostrar módulo</th>
                  <th>Permitir reportar</th>
                </tr>
              </thead>
              <tbody>
                {query.data.roles.map((role) => (
                  <tr key={role.name} className="border-b">
                    <td className="py-3">{role.label}</td>
                    <td>
                      <input
                        aria-label={`Mostrar a ${role.label}`}
                        type="checkbox"
                        checked={config.visibleRoles.includes(role.name)}
                        onChange={(e) =>
                          patch({
                            visibleRoles: e.target.checked
                              ? [...config.visibleRoles, role.name]
                              : config.visibleRoles.filter((r) => r !== role.name),
                            reporterRoles: e.target.checked
                              ? config.reporterRoles
                              : config.reporterRoles.filter((r) => r !== role.name),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Permitir reportar a ${role.label}`}
                        type="checkbox"
                        disabled={!config.visibleRoles.includes(role.name)}
                        checked={config.reporterRoles.includes(role.name)}
                        onChange={(e) =>
                          patch({
                            reporterRoles: e.target.checked
                              ? [...config.reporterRoles, role.name]
                              : config.reporterRoles.filter((r) => r !== role.name),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Mostrar el módulo permite consultar orientación. Los permisos de lectura y gestión se
            conceden por expediente. Los responsables con casos asignados conservan la entrada al
            módulo para continuar su atención.
          </p>
        </CardContent>
      </Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" asChild>
          <Link to="/dece">Ir al módulo DECE</Link>
        </Button>
        <Button loading={save.isPending} onClick={() => save.mutate(config)}>
          Guardar configuración DECE
        </Button>
      </div>
    </div>
  )
}
