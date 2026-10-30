import { Navigate, useLocation } from 'react-router-dom'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { useSubscriptionStatus } from '@/features/subscription/hooks/useSubscription'
import { useAuthStore } from '@/store/auth.store'

export function PersonalSubscriptionGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const isPersonal = useAuthStore((s) => s.user?.institution?.accountType === 'personal')
  const subscription = useSubscriptionStatus()

  if (!isPersonal) return <>{children}</>
  if (subscription.isLoading) return <PageLoader />

  if (subscription.data?.status?.readOnly && location.pathname !== '/subscription') {
    return <Navigate to="/subscription" replace state={{ subscriptionExpired: true }} />
  }

  return <>{children}</>
}
