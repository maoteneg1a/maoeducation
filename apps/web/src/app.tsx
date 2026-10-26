import { useAuthStore } from '@/store/auth.store'
import { queryClient } from '@/shared/lib/query-client'
import { RouterProvider } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { router } from './router'
import { ThemeProvider } from '@/shared/components/ThemeProvider'
import { WhatsAppButton } from '@/shared/components/WhatsAppButton'
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog'
import { AppErrorBoundary } from '@/shared/components/feedback/AppErrorBoundary'

export function App() {
  const sessionKey = useAuthStore((state) => `${state.user?.institutionId ?? ''}:${state.user?.id ?? ''}:${state.guardianStudentId ?? ''}`)
  return (
    <QueryClientProvider key={sessionKey} client={queryClient}>
      <ThemeProvider>
        <AppErrorBoundary>
          <RouterProvider router={router} />
        </AppErrorBoundary>
      </ThemeProvider>
      <Toaster richColors position="top-right" />
      <ConfirmDialogHost />
      <WhatsAppButton />
    </QueryClientProvider>
  )
}
