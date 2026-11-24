import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authApi, type LoginPayload } from '../api/auth.api'
import { useAuthStore } from '@/store/auth.store'
import { getErrorMessage } from '@/shared/lib/utils'
import { rememberInstitutionCode, setLoginTypePreference } from '@/shared/lib/login-preference'
import { mobileDemoInstitution } from '@/features/mobile/mobile-demo'

export function useLogin() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const data = await authApi.login(mobileDemoInstitution ? { ...payload, institutionCode: mobileDemoInstitution } : payload)
      if (mobileDemoInstitution && !data.user.roles.some(role => role === 'student' || role === 'guardian')) {
        await authApi.logout().catch(() => {})
        throw new Error('Esta beta es para alumnos y representantes de Escuela Demo.')
      }
      return data
    },
    onSuccess: (data, variables) => {
      setLoginTypePreference('institution')
      rememberInstitutionCode(variables.institutionCode)
      setAuth(data.user, data.accessToken)
      navigate('/dashboard', { replace: true })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })
}
