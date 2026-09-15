import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { SubscriptionBanner } from '@/features/subscription/components/SubscriptionBanner'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-dvh bg-background overflow-hidden">
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <Topbar onMobileMenuClick={() => setMobileOpen((v) => !v)} />

        <SubscriptionBanner />

        <main className="flex-1 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
