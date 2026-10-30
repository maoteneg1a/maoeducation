import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { personalApi, PersonalRegisterDto } from '../api/personal.api'

export function usePersonalRegistrationStatus() {
  return useQuery({
    queryKey: ['personal-registration-status'],
    queryFn: personalApi.registrationStatus,
  })
}
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { setLoginTypePreference } from '@/shared/lib/login-preference'

export function usePersonalRegister() {
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (dto: PersonalRegisterDto) => personalApi.register(dto),
    onSuccess: (_data, variables) => {
      navigate(`/personal/check-email?email=${encodeURIComponent(variables.email)}`, { replace: true })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function usePersonalLogin() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  return useMutation({
    mutationFn: (dto: { email: string; password: string }) => personalApi.login(dto),
    onSuccess: (data) => {
      const d = data as { accessToken: string; user: Parameters<typeof setAuth>[0] }
      setLoginTypePreference('personal')
      setAuth(d.user, d.accessToken)
      navigate('/dashboard', { replace: true })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => personalApi.resendVerification(email),
    onSuccess: () => toast.success('Enlace enviado. Revisa tu bandeja.'),
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
