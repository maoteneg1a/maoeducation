import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.auleka.mobile',
  appName: 'Auleka',
  webDir: 'dist',
  loggingBehavior: 'none',
  plugins: {
    CapacitorHttp: { enabled: true },
  },
}

export default config
