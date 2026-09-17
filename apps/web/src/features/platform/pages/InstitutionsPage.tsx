import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Users, LayoutGrid, Sparkles, Settings } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
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
import { toast } from 'sonner'
import {
  useCreateInstitution,
  useInstitutions,
  useToggleInstitution,
  useUpdateInstitutionModules,
  useSetTestFlag,
  useSeedTestData,
} from '../hooks/usePlatform'
import type { Institution } from '../api/platform.api'
import { ALL_MODULES, MODULE_GROUPS, MODULE_LABELS, PERSONAL_DEFAULT_MODULES, type ModuleKey } from '@/shared/lib/modules'
import { InstitutionConfigDialog } from '../components/InstitutionConfigDialog'

const schema = z.object({
  name: z.string().min(2, 'Mínimo 2 caracteres'),
  code: z.string().min(2, 'Mínimo 2 caracteres'),
  adminFirstName: z.string().min(1, 'Requerido'),
  adminLastName: z.string().min(1, 'Requerido'),
  adminEmail: z.string().email('Email inválido'),
  adminPassword: z.string().min(8, 'Mínimo 8 caracteres'),
  regime: z.enum(['SIERRA_AMAZONIA', 'COSTA_GALAPAGOS']),
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

  const [dialogOpen, setDialogOpen] = useState(false)
  const [modulesInstitution, setModulesInstitution] = useState<Institution | null>(null)
  const [selectedModules, setSelectedModules] = useState<string[]>([])
  const [configInstitution, setConfigInstitution] = useState<Institution | null>(null)

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const openCreate = () => {
    reset({ name: '', code: '', adminFirstName: '', adminLastName: '', adminEmail: '', adminPassword: '', regime: 'SIERRA_AMAZONIA' })
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
      },
      { onSuccess: () => setDialogOpen(false) },
    )
  }

  const columns: ColumnDef<Institution>[] = [
    { accessorKey: 'name', header: 'Institución' },
    {
      accessorKey: 'code',
      header: 'Código',
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: 'userCount',
      header: 'Usuarios',
      cell: ({ row }) => <span className="tabular-nums">{row.original.userCount}</span>,
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: ({ row }) => {
        const isPersonal = (row.original.settings as Record<string, unknown> | undefined)?.accountType === 'personal'
        return (
          <Badge variant={isPersonal ? 'outline' : 'secondary'}>
            {isPersonal ? 'Personal' : 'Institución'}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'destructive'}>
          {row.original.isActive ? 'Activa' : 'Inactiva'}
        </Badge>
      ),
    },
    {
      id: 'isTest',
      header: 'Prueba',
      cell: ({ row }) => (
        <button
          type="button"
          className="text-left"
          title={row.original.isTestInstitution ? 'Marcar como escuela real (oculta el botón de sembrar datos de prueba)' : 'Marcar como institución de prueba'}
          onClick={() => setTestFlag.mutate({ id: row.original.id, isTestInstitution: !row.original.isTestInstitution })}
        >
          <Badge variant={row.original.isTestInstitution ? 'outline' : 'secondary'}>
            {row.original.isTestInstitution ? 'De prueba' : 'Real'}
          </Badge>
        </button>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          {row.original.isTestInstitution && (
            <Button
              variant="outline"
              size="sm"
              loading={seedTestData.isPending && seedTestData.variables === row.original.id}
              onClick={() =>
                seedTestData.mutate(row.original.id, {
                  onSuccess: (result) => {
                    toast.success(
                      `Datos de prueba listos: ${result.parallelName}, ${result.teacherEmails.length} docentes, ${result.studentEmails.length} alumnos (contraseña: ${result.password})`,
                      { duration: 15000 },
                    )
                  },
                })
              }
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Sembrar prueba
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => openModules(row.original)}
          >
            <LayoutGrid className="mr-1.5 h-4 w-4" />
            Módulos
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigInstitution(row.original)}
          >
            <Settings className="mr-1.5 h-4 w-4" />
            Config
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/platform/institutions/${row.original.id}/admins`)}
          >
            <Users className="mr-1.5 h-4 w-4" />
            Admins
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={toggleInstitution.isPending && toggleInstitution.variables === row.original.id}
            onClick={() => toggleInstitution.mutate(row.original.id)}
          >
            {row.original.isActive ? 'Desactivar' : 'Activar'}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Instituciones</h1>
          <p className="text-sm text-slate-500">Crea y administra las instituciones de la plataforma</p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={institutions}
        isLoading={isLoading}
        emptyMessage="Sin instituciones"
        emptyDescription="Crea la primera institución para empezar"
        action={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva institución
          </Button>
        }
      />

      {/* Dialog — Crear institución */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Nueva institución</DialogTitle>
              <DialogDescription>
                Se crearán los roles, permisos y catálogos base, junto al administrador inicial.
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
                  Se crea automáticamente el año lectivo 2026-2027 activo con sus 3 trimestres — editable después.
                </p>
              </div>
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
