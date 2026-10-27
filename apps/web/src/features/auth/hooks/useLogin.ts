import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { authApi, type LoginPayload } from '../api/auth.api'
import { useAuthStore } from '@/store/auth.store'
import { getErrorMessage } from '@/shared/lib/utils'
import { rememberInstitutionCode, setLoginTypePreference } from '@/shared/lib/login-preference'

export function useLogin() {
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: LoginPayload) => authApi.login(payload),
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
