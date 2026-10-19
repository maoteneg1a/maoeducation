import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { router } from './router'
import { ThemeProvider } from '@/shared/components/ThemeProvider'
import { WhatsAppButton } from '@/shared/components/WhatsAppButton'
import { ConfirmDialogHost } from '@/shared/components/ui/confirm-dialog'
import { AppErrorBoundary } from '@/shared/components/feedback/AppErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
