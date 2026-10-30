import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { usePersonalRegister, usePersonalRegistrationStatus } from '../hooks/usePersonalAuth'

const schema = z.object({
  firstName: z.string().min(1, 'Requerido'),
  lastName: z.string().min(1, 'Requerido'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
})

type Form = z.infer<typeof schema>

export function PersonalRegisterPage() {
  const { data: status, isLoading } = usePersonalRegistrationStatus()
  const { mutate, isPending, error } = usePersonalRegister()
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<Form>({ resolver: zodResolver(schema) })

  if (isLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50"><div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary" /></main>
  }

  if (!status?.personalRegistrationEnabled) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <img src="/isotipo.svg" alt="Auleka" className="mx-auto h-14 w-14" />
          <div className="mx-auto mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700"><LockKeyhole className="h-5 w-5" /></div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Registro temporalmente cerrado</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Por el momento no estamos creando nuevas cuentas personales. Si ya tienes una cuenta, puedes seguir ingresando normalmente.</p>
          <Button asChild className="mt-6 w-full"><Link to="/personal/login">Ingresar a mi cuenta personal</Link></Button>
          <Link to="/login" className="mt-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Volver al acceso institucional</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-center">
          <img src="/isotipo.svg" alt="Auleka" className="mx-auto h-14 w-14" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Crea tu aula personal</h1>
          <p className="mt-1 text-sm text-slate-500">¿Ya tienes cuenta? <Link to="/personal/login" className="text-primary hover:underline">Inicia sesión</Link></p>
        </div>
        {error && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{(error as Error).message ?? 'Error al crear la cuenta'}</div>}
        <form onSubmit={handleSubmit((data) => mutate(data))} className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="firstName">Nombre</Label><Input id="firstName" {...register('firstName')} />{errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}</div>
            <div className="space-y-1.5"><Label htmlFor="lastName">Apellido</Label><Input id="lastName" {...register('lastName')} />{errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}</div>
          </div>
          <div className="space-y-1.5"><Label htmlFor="email">Correo electrónico</Label><Input id="email" type="email" {...register('email')} />{errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}</div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} className="pr-10" {...register('password')} /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
            {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
          </div>
          <Button type="submit" className="w-full" loading={isPending}>Crear cuenta personal</Button>
        </form>
      </section>
    </main>
  )
}
