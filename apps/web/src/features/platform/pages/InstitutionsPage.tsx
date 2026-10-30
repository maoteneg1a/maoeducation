import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MoreHorizontal, Plus, Search, School, UserPlus, Users, LayoutGrid, Sparkles, Settings } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { toast } from 'sonner'
import {
  useCreateInstitution,
  useInstitutions,
  useToggleInstitution,
  useUpdateInstitutionModules,
  useSetTestFlag,
  useSeedTestData,
  usePlatformLeads,
  usePlatformRole,
  useUpdateLead,
  usePlatformSettings,
  useSetPersonalRegistrationEnabled,
} from '../hooks/usePlatform'
import type { Institution } from '../api/platform.api'
import { ALL_MODULES, MODULE_GROUPS, MODULE_LABELS, PERSONAL_DEFAULT_MODULES, type ModuleKey } from '@/shared/lib/modules'
import { InstitutionConfigDialog } from '../components/InstitutionConfigDialog'
import { PlatformUsersTable } from '../components/PlatformUsersTable'

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  code: z.string().min(2, 'Mínimo 2 caracteres'),
  adminFirstName: z.string().min(1, 'Requerido'),
  adminLastName: z.string().min(1, 'Requerido'),
  adminEmail: z.string().email('Email inválido'),
  adminPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  regime: z.enum(['SIERRA_AMAZONIA', 'COSTA_GALAPAGOS']),
  isTestInstitution: z.boolean(),
})

type FormValues = z.infer<typeof schema>

export function InstitutionsPage() {
  const navigate = useNavigate()
  const { data: institutions = [], isLoading } = useInstitutions()
  const createInstitution = useCreateInstitution()
  const toggleInstitution = useToggleInstitution()
  const updateModules = useUpdateInstitutionModules()
  const setTestFlag = useSetTestFlag()
  const seedTestData = useSeedTestData()
  const updateLead = useUpdateLead()
  const { isOwner } = usePlatformRole()
  const { data: platformSettings, isLoading: isLoadingSettings } = usePlatformSettings()
  const setPersonalRegistration = useSetPersonalRegistrationEnabled()

  const [search, setSearch] = useState('')
  const filteredInstitutions = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return institutions
    return institutions.filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
  }, [institutions, search])

  // Conversión desde un lead: /platform?newFromLead=<leadId>
  const [searchParams, setSearchParams] = useSearchParams()
  const newFromLead = searchParams.get('newFromLead')
  const { data: leads } = usePlatformLeads({ enabled: !!newFromLead })
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null)
  const handledLeadRef = useRef<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [modulesInstitution, setModulesInstitution] = useState<Institution | null>(null)
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [configInstitution, setConfigInstitution] = useState<Institution | null>(null)
  const [usersInstitution, setUsersInstitution] = useState<Institution | null>(null)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  useEffect(() => {
    if (!newFromLead || !leads || handledLeadRef.current === newFromLead) return
    handledLeadRef.current = newFromLead
    const lead = leads.find((l) => l.id === newFromLead)
    const next = new URLSearchParams(searchParams)
    next.delete('newFromLead')
    setSearchParams(next, { replace: true })
    if (!lead) {
      toast.error('No se encontró el lead a convertir')
      return
    }
    const [firstName, ...rest] = lead.name.trim().split(/\s+/)
    reset({
      name: lead.institutionName ?? '',
      code: '',
      adminFirstName: firstName ?? '',
      adminLastName: rest.join(' '),
      adminEmail: lead.email,
      adminPassword: '',
      regime: 'SIERRA_AMAZONIA',
      isTestInstitution: false,
    })
    setConvertingLeadId(lead.id)
    setDialogOpen(true)
  }, [newFromLead, leads, searchParams, setSearchParams, reset])

  const handleToggle = async (inst: Institution) => {
    if (inst.isActive) {
      const ok = await confirmDialog({
        title: `¿Desactivar ${inst.name}?`,
        description: 'Ningún usuario de esta institución podrá iniciar sesión hasta que la reactives. Sus datos se conservan.',
        confirmText: 'Desactivar',
        destructive: true,
      })
      if (!ok) return
    } else {
      const ok = await confirmDialog({
        title: `¿Activar ${inst.name}?`,
        description: 'Sus usuarios podrán volver a iniciar sesión.',
        confirmText: 'Activar',
      })
      if (!ok) return
    }
    toggleInstitution.mutate(inst.id)
  }

  const openCreate = () => {
    setConvertingLeadId(null)
    reset({ name: '', code: '', adminFirstName: '', adminLastName: '', adminEmail: '', adminPassword: '', regime: 'SIERRA_AMAZONIA', isTestInstitution: false })
    setDialogOpen(true)
  }

  const openModules = (inst: Institution) => {
    const current = (inst.settings?.modules as string[] | undefined) ?? [...ALL_MODULES]
    setSelectedModules(current)
    setModulesInstitution(inst)
  }

  const toggleModule = (key: string) => {
    setSelectedModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key],
    )
  }

  /** Activa todo el grupo, o lo apaga completo si ya estaba todo activo. */
  const toggleGroup = (modules: readonly ModuleKey[]) => {
    setSelectedModules((prev) => {
      const allActive = modules.every((m) => prev.includes(m))
      return allActive
        ? prev.filter((m) => !modules.includes(m as ModuleKey))
        : [...prev.filter((m) => !modules.includes(m as ModuleKey)), ...modules]
    })
  }

  const saveModules = () => {
    if (!modulesInstitution) return
    updateModules.mutate(
      { id: modulesInstitution.id, modules: selectedModules },
      { onSuccess: () => setModulesInstitution(null) },
    )
  }

  const onSubmit = (values: FormValues) => {
    createInstitution.mutate(
      {
        name: values.name,
        code: values.code,
        admin: {
          firstName: values.adminFirstName,
          lastName: values.adminLastName,
          email: values.adminEmail,
          password: values.adminPassword,
        },
        regime: values.regime,
        isTestInstitution: values.isTestInstitution,
      },
      {
        onSuccess: (created) => {
          setDialogOpen(false)
          if (convertingLeadId && created?.id) {
            updateLead.mutate(
              { id: convertingLeadId, data: { convertedInstitutionId: created.id, status: 'closed_won' } },
              { onSuccess: () => toast.success('Lead marcado como convertido') },
            )
          }
          setConvertingLeadId(null)
        },
      },
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Instituciones</h1>
          <p className="text-sm text-slate-500">Administra las instituciones y sus usuarios</p>
        </div>
      </div>

      {isOwner && (
        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${platformSettings?.personalRegistrationEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-900">Registro de cuentas personales</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {platformSettings?.personalRegistrationEnabled
                  ? 'Los docentes pueden crear nuevas cuentas personales.'
                  : 'La creación de nuevas cuentas personales está cerrada.'}
              </p>
            </div>
          </div>
          <Button
            variant={platformSettings?.personalRegistrationEnabled ? 'outline' : 'default'}
            className="shrink-0"
            disabled={isLoadingSettings || !platformSettings}
            loading={setPersonalRegistration.isPending}
            onClick={() => setPersonalRegistration.mutate(!platformSettings?.personalRegistrationEnabled)}
          >
            {platformSettings?.personalRegistrationEnabled ? 'Deshabilitar registros' : 'Habilitar registros'}
          </Button>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o código..."
              className="h-10 bg-slate-50 pl-9"
            />
          </div>
          {isOwner && (
            <Button onClick={openCreate} className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Nueva institución
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filteredInstitutions.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-3 rounded-full bg-slate-100 p-3"><School className="h-6 w-6 text-slate-500" /></div>
            <p className="font-semibold text-slate-900">{search ? 'Sin coincidencias' : 'Sin instituciones'}</p>
            <p className="mt-1 text-sm text-slate-500">
              {search ? 'Prueba con otro nombre o código.' : 'Crea la primera institución para empezar.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredInstitutions.map((institution) => {
              const isPersonal = institution.settings?.accountType === 'personal'
              return (
                <article key={institution.id} className="p-4 transition-colors hover:bg-slate-50/70 sm:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 sm:flex">
                        <School className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          to={`/platform/institutions/${institution.id}`}
                          className="block truncate font-semibold text-slate-900 hover:text-primary hover:underline"
                        >
                          {institution.name}
                        </Link>
                        <p className="mt-1 truncate font-mono text-xs text-slate-500">{institution.code}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge variant={institution.isActive ? 'success' : 'destructive'}>
                            {institution.isActive ? 'Activa' : 'Inactiva'}
                          </Badge>
                          <Badge variant={isPersonal ? 'outline' : 'secondary'}>
                            {isPersonal ? 'Personal' : 'Institución'}
                          </Badge>
                          <button
                            type="button"
                            disabled={!isOwner}
                            title={institution.isTestInstitution ? 'Marcar como institución real' : 'Marcar como institución de prueba'}
                            onClick={() => setTestFlag.mutate({ id: institution.id, isTestInstitution: !institution.isTestInstitution })}
                          >
                            <Badge variant={institution.isTestInstitution ? 'outline' : 'secondary'}>
                              {institution.isTestInstitution ? 'De prueba' : 'Real'}
                            </Badge>
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setUsersInstitution(institution)}
                      className="flex w-fit items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700"
                    >
                      <Users className="h-4 w-4" />
                      <span className="font-semibold tabular-nums">{institution.userCount}</span>
                      {institution.userCount === 1 ? 'usuario' : 'usuarios'}
                    </button>

                    <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                      {isOwner && (
                        <Button variant="outline" size="sm" onClick={() => openModules(institution)}>
                          <LayoutGrid className="mr-1.5 h-4 w-4" />
                          Módulos
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/platform/institutions/${institution.id}/admins`)}
                      >
                        <Users className="mr-1.5 h-4 w-4" />
                        Admins
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" aria-label={`Más acciones para ${institution.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          {isOwner && (
                            <DropdownMenuItem onSelect={() => setConfigInstitution(institution)}>
                              <Settings /> Configuración
                            </DropdownMenuItem>
                          )}
                          {isOwner && institution.isTestInstitution && (
                            <DropdownMenuItem
                              disabled={seedTestData.isPending}
                              onSelect={() => seedTestData.mutate(institution.id, {
                                onSuccess: (result) => toast.success(
                                  `Datos listos: ${result.parallelName}, ${result.teacherEmails.length} docentes y ${result.studentEmails.length} alumnos`,
                                  { duration: 10000 },
                                ),
                              })}
                            >
                              <Sparkles /> Sembrar datos de prueba
                            </DropdownMenuItem>
                          )}
                          {isOwner && <DropdownMenuSeparator />}
                          {isOwner && (
                            <DropdownMenuItem
                              className={institution.isActive ? 'text-red-600 focus:text-red-700' : 'text-emerald-700 focus:text-emerald-800'}
                              onSelect={() => handleToggle(institution)}
                            >
                              {institution.isActive ? 'Desactivar institución' : 'Activar institución'}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
      <Dialog open={!!usersInstitution} onOpenChange={(open) => { if (!open) setUsersInstitution(null) }}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Usuarios de {usersInstitution?.name}</DialogTitle>
            <DialogDescription>Consulta los usuarios y sus roles dentro de esta institución.</DialogDescription>
          </DialogHeader>
          {usersInstitution && (
            <PlatformUsersTable key={usersInstitution.id} institutionId={usersInstitution.id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog — Crear institución */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Nueva institución</DialogTitle>
              <DialogDescription>
                {convertingLeadId
                  ? 'Datos precargados desde el lead. Al crearla, el lead quedará marcado como convertido.'
                  : 'Se crearán los roles, permisos y catálogos base, junto al administrador inicial.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre</Label>
                <Input id="name" placeholder="Unidad Educativa..." {...register('name')} />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="code">Código</Label>
                <Input id="code" placeholder="MI_ESCUELA" {...register('code')} />
                {errors.code && <p className="text-xs text-red-500">{errors.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Régimen académico</Label>
                <Select value={watch('regime')} onValueChange={(v) => setValue('regime', v as FormValues['regime'])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar régimen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SIERRA_AMAZONIA">Sierra / Amazonía (septiembre—julio)</SelectItem>
                    <SelectItem value="COSTA_GALAPAGOS">Costa / Galápagos (abril—febrero)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Se crea automáticamente el año lectivo vigente con sus 3 trimestres — editable después.
                </p>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-0.5 h-4 w-4" {...register('isTestInstitution')} />
                <span>
                  Institución de prueba / demo
                  <span className="block text-xs text-muted-foreground">
                    Habilita “Sembrar datos de prueba”. No la marques para escuelas reales.
                  </span>
                </span>
              </label>
              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium text-slate-700">Administrador inicial</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="adminFirstName">Nombre</Label>
                    <Input id="adminFirstName" {...register('adminFirstName')} />
                    {errors.adminFirstName && <p className="text-xs text-red-500">{errors.adminFirstName.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="adminLastName">Apellido</Label>
                    <Input id="adminLastName" {...register('adminLastName')} />
                    {errors.adminLastName && <p className="text-xs text-red-500">{errors.adminLastName.message}</p>}
                  </div>
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="adminEmail">Email</Label>
                  <Input id="adminEmail" type="email" {...register('adminEmail')} />
                  {errors.adminEmail && <p className="text-xs text-red-500">{errors.adminEmail.message}</p>}
                </div>
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="adminPassword">Contraseña</Label>
                  <Input id="adminPassword" type="password" {...register('adminPassword')} />
                  {errors.adminPassword && <p className="text-xs text-red-500">{errors.adminPassword.message}</p>}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={createInstitution.isPending}>Crear institución</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog — Módulos */}
      <Dialog open={!!modulesInstitution} onOpenChange={(o) => !o && setModulesInstitution(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Módulos — {modulesInstitution?.name}</DialogTitle>
            <DialogDescription>
              Activa o desactiva módulos del sidebar para esta institución.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-3">
            <div className="flex gap-2 text-xs">
              <button
                className="text-blue-600 hover:underline"
                onClick={() => setSelectedModules([...ALL_MODULES])}
              >
                Activar todos
              </button>
              <span className="text-slate-300">·</span>
              <button
                className="text-slate-500 hover:underline"
                onClick={() => setSelectedModules([...PERSONAL_DEFAULT_MODULES])}
              >
                Preset personal
              </button>
              <span className="text-slate-300">·</span>
              <button
                className="text-red-500 hover:underline"
                onClick={() => setSelectedModules([])}
              >
                Desactivar todos
              </button>
            </div>

            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              {MODULE_GROUPS.map((group) => {
                const activeInGroup = group.modules.filter((m) => selectedModules.includes(m)).length
                return (
                  <div key={group.id}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 shrink-0">
                        {group.label}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {activeInGroup}/{group.modules.length}
                      </span>
                      <span className="flex-1 h-px bg-slate-200" />
                      <button
                        type="button"
                        className="text-[10px] text-slate-400 hover:text-slate-700 hover:underline shrink-0"
                        onClick={() => toggleGroup(group.modules)}
                      >
                        {activeInGroup === group.modules.length ? 'quitar todos' : 'activar todos'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-2">{group.description}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {group.modules.map((key) => {
                        const active = selectedModules.includes(key)
                        const isPersonalDefault = PERSONAL_DEFAULT_MODULES.includes(key)
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleModule(key)}
                            className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                              active
                                ? 'border-blue-200 bg-blue-50 text-blue-800'
                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                            }`}
                          >
                            <span className={`h-3.5 w-3.5 rounded-sm border flex items-center justify-center shrink-0 ${active ? 'border-blue-600 bg-blue-600' : 'border-slate-300'}`}>
                              {active && <span className="text-white text-[9px] leading-none">✓</span>}
                            </span>
                            <span className="truncate">{MODULE_LABELS[key]}</span>
                            {isPersonalDefault && (
                              <span className="ml-auto shrink-0 text-[10px] text-slate-400">personal</span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-slate-400">
              {selectedModules.length} de {ALL_MODULES.length} módulos activos
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModulesInstitution(null)}>Cancelar</Button>
            <Button onClick={saveModules} loading={updateModules.isPending}>
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InstitutionConfigDialog institution={configInstitution} onClose={() => setConfigInstitution(null)} />
    </div>
  )
}
