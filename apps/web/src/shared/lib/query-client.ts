import { QueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../../store/auth.store'

const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export let queryClient = createQueryClient()

// El caché de una cuenta nunca debe reutilizarse al iniciar otra sesión,
// cambiar de institución o cambiar el estudiante activo del representante.
// Renovar el token de la misma sesión conserva sus consultas.
useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id ||
      state.user?.institutionId !== previous.user?.institutionId ||
      state.guardianStudentId !== previous.guardianStudentId) {
    const previousClient = queryClient
    queryClient = createQueryClient()
    previousClient.clear()
  }
})
