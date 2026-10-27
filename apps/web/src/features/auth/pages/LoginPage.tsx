import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, Check } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useLogin } from '../hooks/useLogin'
import { usePersonalLogin } from '@/features/personal/hooks/usePersonalAuth'
import { useAuthStore } from '@/store/auth.store'
import { getLoginTypePreference, getRememberedInstitutionCode, type LoginType } from '@/shared/lib/login-preference'

const institutionSchema = z.object({
  institutionCode: z.string().min(1, 'Requerido'),
  email:           z.string().min(1, 'Requerido'),
  password:        z.string().min(1, 'Requerido'),
})
const personalSchema = z.object({
  email:    z.string().min(1, 'Requerido'),
  password: z.string().min(1, 'Requerido'),
})

type InstitutionForm = z.infer<typeof institutionSchema>
type PersonalForm = z.infer<typeof personalSchema>

const FEATURES = [
  'Calificaciones y asistencia en tiempo real',
  'Comunicación directa con padres de familia',
  'Reportes y estadísticas académicas',
  'Gestión de matrículas e incidentes DECE',
]

export function LoginPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const [searchParams] = useSearchParams()
  const forcedType = searchParams.get('type') === 'personal' ? 'personal' : null
  const [loginType, setLoginType] = useState<LoginType>(forcedType ?? getLoginTypePreference())
  const [showPassword, setShowPassword] = useState(false)

  const { mutate: loginInstitution, isPending: isInstitutionPending } = useLogin()
  const { mutate: loginPersonal, isPending: isPersonalPending } = usePersonalLogin()

  const institutionForm = useForm<InstitutionForm>({
    resolver: zodResolver(institutionSchema),
    defaultValues: { institutionCode: getRememberedInstitutionCode() },
  })
  const personalForm = useForm<PersonalForm>({ resolver: zodResolver(personalSchema) })

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const isPersonal = loginType === 'personal'

  return (
    <div className="min-h-screen flex">
      {/* Left: Auleka brand panel */}
      <div
        className="hidden md:flex md:w-5/12 lg:w-1/2 relative flex-col items-start justify-center px-12 py-16 overflow-hidden"
        style={{ background: 'linear-gradient(140deg, #2563EB 0%, #16A34A 100%)' }}
      >
        {/* Decorative blobs */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-white/8 pointer-events-none" />
        <div className="absolute top-1/2 right-8 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-10 max-w-md">
          <img src="/logo-white.svg" alt="Auleka" className="w-48" />

          <div>
            <p className="text-white text-2xl font-bold font-display leading-snug">
              Todo tu colegio<br />en un solo lugar
            </p>
            <p className="text-white/70 text-sm mt-2">
              Gestión académica integral para instituciones educativas
            </p>
          </div>

          <ul className="flex flex-col gap-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-white/85 text-sm">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 shrink-0">
                  <Check className="w-3 h-3 text-white" strokeWidth={3} />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="absolute bottom-6 left-12 text-white/35 text-xs">
          © {new Date().getFullYear()} Auleka
        </p>
      </div>

      {/* Right: login form */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white">
        <div className="w-full max-w-sm space-y-6">
          {/* Header */}
          <div className="flex flex-col items-center gap-3">
            <img src="/isotipo.svg" alt="Auleka" className="h-16 w-16" />
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 font-display">Bienvenido</h1>
              <p className="text-sm text-gray-500 mt-1">Ingresa tus credenciales para continuar</p>
            </div>
          </div>

          {/* Selector de tipo de cuenta */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => setLoginType('institution')}
              className={`text-sm font-medium py-2 rounded-md transition-colors ${
                !isPersonal ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Mi institución
            </button>
            <button
              type="button"
              onClick={() => setLoginType('personal')}
              className={`text-sm font-medium py-2 rounded-md transition-colors ${
                isPersonal ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Profesor personal
            </button>
          </div>

          {isPersonal ? (
            <form key="personal" autoComplete="on" onSubmit={personalForm.handleSubmit((data) => loginPersonal(data))} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="p-email">Correo electrónico</Label>
                <Input id="p-email" type="email" autoComplete="username" placeholder="profe@ejemplo.com" {...personalForm.register('email')} />
                {personalForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{personalForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="p-password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="p-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="pr-10"
                    {...personalForm.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {personalForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{personalForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" loading={isPersonalPending} className="w-full mt-2">
                Ingresar
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                ¿No tienes cuenta?{' '}
                <Link to="/personal/register" className="text-primary hover:underline">Regístrate gratis</Link>
              </p>
            </form>
          ) : (
            <form key="institution" autoComplete="on" onSubmit={institutionForm.handleSubmit((data) => loginInstitution(data))} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="institutionCode">Código de institución</Label>
                <Input
                  id="institutionCode"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Código asignado por tu institución"
                  {...institutionForm.register('institutionCode')}
                />
                {institutionForm.formState.errors.institutionCode && (
                  <p className="text-xs text-destructive">{institutionForm.formState.errors.institutionCode.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Correo o cédula</Label>
                <Input
                  id="email"
                  type="text"
                  autoComplete="username"
                  placeholder="correo@escuela.edu o cédula"
                  {...institutionForm.register('email')}
                />
                {institutionForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{institutionForm.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    {...institutionForm.register('password')}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {institutionForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{institutionForm.formState.errors.password.message}</p>
                )}
              </div>

              <Button type="submit" loading={isInstitutionPending} className="w-full mt-2">
                Ingresar
              </Button>
            </form>
          )}

          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Auleka
          </p>
        </div>
      </div>
    </div>
  )
}
