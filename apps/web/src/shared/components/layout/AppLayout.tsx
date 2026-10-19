import { Outlet } from 'react-router-dom'
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { SubscriptionBanner } from '@/features/subscription/components/SubscriptionBanner'
import { ImpersonationBanner } from './ImpersonationBanner'
import { PlatformAnnouncementBanner } from './PlatformAnnouncementBanner'
import { CommandPalette } from './CommandPalette'

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-dvh bg-background overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Saltar al contenido
      </a>
      <Sidebar
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <ImpersonationBanner />
        <Topbar onMobileMenuClick={() => setMobileOpen((v) => !v)} />

        <PlatformAnnouncementBanner />
        <SubscriptionBanner />

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto px-4 py-4 focus:outline-none md:px-6 md:py-6">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}
