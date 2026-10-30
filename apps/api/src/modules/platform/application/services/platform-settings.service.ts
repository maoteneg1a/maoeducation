import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'

const PERSONAL_REGISTRATION_KEY = 'personal_registration_enabled'

export interface PlatformSettings {
  personalRegistrationEnabled: boolean
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const setting = await prisma.platformSetting.findUnique({
    where: { key: PERSONAL_REGISTRATION_KEY },
    select: { value: true },
  })

  return { personalRegistrationEnabled: setting?.value === true }
}

export async function setPersonalRegistrationEnabled(enabled: boolean): Promise<PlatformSettings> {
  await prisma.platformSetting.upsert({
    where: { key: PERSONAL_REGISTRATION_KEY },
    create: { key: PERSONAL_REGISTRATION_KEY, value: enabled as Prisma.InputJsonValue },
    update: { value: enabled as Prisma.InputJsonValue },
  })

  return { personalRegistrationEnabled: enabled }
}
