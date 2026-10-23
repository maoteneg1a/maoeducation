import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  FRAMEWORK_LABEL,
  REGIME_LABEL,
  SOSTENIMIENTO_LABEL,
  normativeApi,
  type AcademicRegimeCode,
  type NormativeFramework,
  type NormativeProfile,
  type NormativeProfileResponse,
  type Sostenimiento,
} from '../api/normative.api'
import { CheckField, FieldGrid, SelectField } from './form-bits'

const INHERIT = '__inherit__'

export function FrameworkTab({ data }: { data: NormativeProfileResponse }) {
  const qc = useQueryClient()
  const [profile, setProfile] = useState<NormativeProfile>(data.profile)
  const [includeScales, setIncludeScales] = useState(true)
  const [includeWeights, setIncludeWeights] = useState(false)

  useEffect(() => setProfile(data.profile), [data.profile])

  const save = useMutation({
    mutationFn: () => normativeApi.updateProfile({ profile }),
    onSuccess: (res) => {
      qc.setQueryData(['normative-profile'], res)
      qc.invalidateQueries({ queryKey: ['grading-config'] })
      toast.success('Marco normativo guardado')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const preset = useMutation({
    mutationFn: () => normativeApi.applyPreset({ includeScales, includeWeights }),
    onSuccess: (res) => {
      qc.setQueryData(['normative-profile'], res)
      qc.invalidateQueries({ queryKey: ['grading-config'] })
      toast.success('Preset del acuerdo aplicado')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const activatingAgreement =
    profile.framework === 'MINEDEC-2026-00082-A' && data.profile.framework !== 'MINEDEC-2026-00082-A'

  const onSave = async () => {
    if (activatingAgreement) {
      const ok = await confirmDialog({
        title: 'Activar el Acuerdo 2026-00082-A',
        description:
          'Desde ahora las notas, promedios, refuerzos y promoción de los años que usen este marco se recalculan con las reglas del acuerdo (truncado de decimales, tope de 7,00 en refuerzo, supletorio 4,01–6,99, etc.). Las notas registradas no se borran, pero los promedios y estados pueden cambiar.',
        confirmText: 'Activar',
      })
      if (!ok) return
    }
    save.mutate()
  }

  const onApplyPreset = async () => {
    const ok = await confirmDialog({
      title: 'Aplicar preset del acuerdo',
      description: (
        <span className="space-y-2">
          <span className="block">Se reemplazan las reglas del motor por los valores del Acuerdo 2026-00082-A y se alinea la configuración de calificación (supletorio, refuerzo y recuperación).</span>
          {includeScales && <span className="block">También se reemplaza la escala cualitativa por A+…E- (art. 7).</span>}
          {includeWeights && <span className="block font-medium text-destructive">Se reescribe la ponderación examen/proyecto (30 %) de TODAS las asignaturas de la institución.</span>}
        </span>
      ),
      confirmText: 'Aplicar',
      destructive: includeWeights,
    })
    if (ok) preset.mutate()
  }

  const setYear = (yearId: string, value: string) => {
    const next = { ...profile.frameworkByYear }
    if (value === INHERIT) delete next[yearId]
    else next[yearId] = value as NormativeFramework
    setProfile({ ...profile, frameworkByYear: next })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Perfil normativo de la institución</CardTitle>
          <CardDescription>
            El sostenimiento define qué reglas son obligatorias (fiscales) y cuáles son referenciales (particulares, fiscomisionales y municipales).
            Las instituciones existentes siguen con el marco anterior hasta que lo cambies aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldGrid>
            <SelectField<Sostenimiento>
              label="Sostenimiento"
              value={profile.sostenimiento}
              onChange={(v) => setProfile({ ...profile, sostenimiento: v })}
              options={data.options.sostenimientos.map((s) => ({ value: s, label: SOSTENIMIENTO_LABEL[s] }))}
            />
            <SelectField<AcademicRegimeCode>
              label="Régimen"
              value={profile.regime}
              onChange={(v) => setProfile({ ...profile, regime: v })}
              options={(Object.keys(REGIME_LABEL) as AcademicRegimeCode[]).map((r) => ({ value: r, label: REGIME_LABEL[r] }))}
            />
            <SelectField<NormativeFramework>
              label="Marco normativo por defecto"
              value={profile.framework}
              onChange={(v) => setProfile({ ...profile, framework: v })}
              options={data.options.frameworks.map((f) => ({ value: f, label: FRAMEWORK_LABEL[f] }))}
            />
          </FieldGrid>

          {activatingAgreement && (
            <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Al activar el acuerdo, los promedios, refuerzos, supletorios y estados de promoción de los años con este marco
              se recalculan con las nuevas reglas. Las notas registradas no se modifican.
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Marco por año lectivo</h3>
            <p className="text-xs text-muted-foreground">
              Úsalo para la transición: por ejemplo, Costa–Galápagos 2026-2027 sigue con el acuerdo anterior (transitoria octava).
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Año lectivo</TableHead>
                    <TableHead>Marco aplicado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.years.map((y) => (
                    <TableRow key={y.id}>
                      <TableCell className="font-medium">
                        {y.name} {y.isActive && <Badge variant="success" className="ml-2">Activo</Badge>}
                      </TableCell>
                      <TableCell>
                        <Select value={profile.frameworkByYear[y.id] ?? INHERIT} onValueChange={(v) => setYear(y.id, v)}>
                          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value={INHERIT}>Usar el marco por defecto ({FRAMEWORK_LABEL[profile.framework]})</SelectItem>
                            {data.options.frameworks.map((f) => <SelectItem key={f} value={f}>{FRAMEWORK_LABEL[f]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {data.years.length === 0 && (
                    <TableRow><TableCell colSpan={2} className="text-center text-sm text-muted-foreground">No hay años lectivos</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={onSave} disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar marco normativo
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cumplimiento</CardTitle>
          <CardDescription>
            Comparación de tu configuración con el acuerdo. Son advertencias: no bloquean el uso del sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.warnings.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> La configuración coincide con el Acuerdo 2026-00082-A.
            </div>
          ) : (
            <ul className="space-y-2">
              {data.warnings.map((w) => (
                <li key={w.code} className="flex items-start gap-2 text-sm">
                  <Badge variant="warning" className="shrink-0">{w.article}</Badge>
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" />Aplicar preset del acuerdo</CardTitle>
          <CardDescription>
            Carga de una sola vez los valores del Acuerdo 2026-00082-A en las reglas del motor y en la configuración de calificación.
            Después puedes ajustar cualquier valor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <CheckField
            label="Reemplazar la escala cualitativa por A+…E- (art. 7)"
            checked={includeScales}
            onChange={setIncludeScales}
          />
          <CheckField
            label="Aplicar ponderación 70 % formativa / 30 % sumativa (art. 36)"
            description="Reescribe el peso de examen y proyecto de TODAS las asignaturas de la institución."
            checked={includeWeights}
            onChange={setIncludeWeights}
          />
          <div className="flex justify-end">
            <Button variant="outline" onClick={onApplyPreset} disabled={preset.isPending}>
              {preset.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Aplicar preset
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
