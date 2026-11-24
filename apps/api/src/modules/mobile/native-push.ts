import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { prisma } from '../../shared/infrastructure/database/prisma'

export function nativePushEnabled(settings: unknown) {
  const value = settings as { mobile?: { nativePush?: boolean } } | null
  return process.env.MOBILE_ANDROID_NATIVE_PUSH === 'true' && value?.mobile?.nativePush === true
}

export async function sendNativePush(userId: string) {
  const credentials = process.env.FCM_SERVICE_ACCOUNT_JSON
  if (process.env.MOBILE_ANDROID_NATIVE_PUSH !== 'true' || !credentials) return 0
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      institution: { select: { settings: true } },
      nativePushDevices: { where: { updatedAt: { gte: new Date(Date.now() - 7 * 86400_000) } }, select: { token: true, updatedAt: true } },
    },
  })
  if (!user?.isActive || !nativePushEnabled(user.institution.settings) || !user.nativePushDevices.length) return 0
  const name = 'auleka-native-push'
  const firebase = getApps().find(app => app.name === name) ?? initializeApp({
    credential: cert(JSON.parse(credentials)),
  }, name)
  const results = await Promise.allSettled(user.nativePushDevices.map(async device => {
    try {
      await getMessaging(firebase).send({
        token: device.token,
        notification: { title: 'Auleka', body: 'Tienes una notificación nueva.' },
        data: { action: 'notifications' },
      })
      return true
    } catch (error) {
      if ((error as { code?: string }).code === 'messaging/registration-token-not-registered') {
        await prisma.nativePushDevice.deleteMany({ where: { ...device, userId } })
      }
      return false
    }
  }))
  return results.filter(result => result.status === 'fulfilled' && result.value).length
}
