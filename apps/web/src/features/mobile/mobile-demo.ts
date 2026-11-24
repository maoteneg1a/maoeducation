import { Capacitor } from '@capacitor/core'

export const mobileDemoInstitution = Capacitor.isNativePlatform()
  ? import.meta.env.VITE_MOBILE_DEMO_INSTITUTION?.trim().toUpperCase() || undefined
  : undefined
