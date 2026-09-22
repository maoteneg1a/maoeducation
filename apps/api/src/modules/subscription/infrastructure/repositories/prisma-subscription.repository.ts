import type { Prisma, SubscriptionPayment } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  computeSubscriptionStatus,
  type SubscriptionStatus,
} from '../../domain/subscription-state'
import type {
  ApprovePaymentDto,
  PaymentStatus,
  PendingPaymentDto,
  PlatformSubscriptionDto,
  ReceiptFileDto,
  SetValidityDto,
  SubmitPaymentDto,
  SubscriptionDetailDto,
  SubscriptionPaymentDto,
} from '../../application/dtos/subscription.dto'

/** Días del período de prueba de una institución nueva. */
export const TRIAL_DAYS = 30

/** Duración por defecto que se propone al aprobar un pago. */
export const PAID_PERIOD_DAYS = 365

const RECEIPT_PREFIX = 'receipts'

type PaymentWithUploader = SubscriptionPayment & {
  uploader: { profile: { firstName: string; lastName: string } | null } | null
}

function toPaymentDto(p: PaymentWithUploader): SubscriptionPaymentDto {
  return {
    id: p.id,
    status: p.status as PaymentStatus,
    amount: p.amount === null ? null : Number(p.amount),
    currency: p.currency,
    transferredAt: p.transferredAt?.toISOString() ?? null,
    reference: p.reference,
    notes: p.notes,
    fileName: p.fileName,
    mimeType: p.mimeType,
    fileSize: p.fileSize,
    uploadedBy: p.uploadedBy,
    uploaderName: p.uploader?.profile
      ? `${p.uploader.profile.firstName} ${p.uploader.profile.lastName}`
      : null,
    reviewedAt: p.reviewedAt?.toISOString() ?? null,
    reviewNotes: p.reviewNotes,
    createdAt: p.createdAt.toISOString(),
  }
}

export function receiptKey(storedName: string): string {
  return `${RECEIPT_PREFIX}/${storedName}`
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
}

export class PrismaSubscriptionRepository {
  /**
   * Estado de la institución, o null si no tiene suscripción gestionada.
   *
   * Null NO significa "vencida": significa que este módulo no la administra y
   * no debe restringirla. Es lo que deja intactas a las instituciones que ya
   * existían antes de que existiera el cobro.
   */
  async getStatus(institutionId: string): Promise<SubscriptionStatus | null> {
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      select: { plan: true, startsAt: true, expiresAt: true, graceDays: true, suspendedAt: true },
    })
    return sub ? computeSubscriptionStatus(sub) : null
  }

  async getDetail(institutionId: string): Promise<SubscriptionDetailDto> {
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      include: {
        payments: {
          orderBy: { createdAt: 'desc' },
          include: { uploader: { include: { profile: true } } },
        },
      },
    })
    if (!sub) return { status: null, notes: null, payments: [] }
    return {
      status: computeSubscriptionStatus(sub),
      notes: sub.notes,
      payments: sub.payments.map(toPaymentDto),
    }
  }

  /** Crea el período de prueba. Se llama dentro de bootstrapInstitution. */
  async createTrial(
    tx: Prisma.TransactionClient,
    institutionId: string,
    days = TRIAL_DAYS,
  ): Promise<void> {
    const now = new Date()
    await tx.subscription.create({
      data: {
        institutionId,
        plan: 'trial',
        startsAt: now,
        expiresAt: addDays(now, days),
      },
    })
  }

  async submitPayment(
    institutionId: string,
    userId: string,
    dto: SubmitPaymentDto,
    file: ReceiptFileDto,
  ): Promise<SubscriptionPaymentDto> {
    const sub = await prisma.subscription.findUnique({
      where: { institutionId },
      select: { id: true },
    })
    if (!sub) {
      throw new NotFoundError('Esta institución no tiene una suscripción activa que renovar')
    }

    const payment = await prisma.subscriptionPayment.create({
      data: {
        subscriptionId: sub.id,
        institutionId,
        status: 'pending',
        amount: dto.amount ?? null,
        currency: dto.currency ?? 'USD',
        transferredAt: dto.transferredAt ? new Date(dto.transferredAt) : null,
        reference: dto.reference ?? null,
        notes: dto.notes ?? null,
        fileName: file.fileName,
        storedName: file.storedName,
        mimeType: file.mimeType,
        fileSize: file.fileSize,
        uploadedBy: userId,
      },
      include: { uploader: { include: { profile: true } } },
    })
    return toPaymentDto(payment)
  }

  // ─── Panel de superadmin ──────────────────────────────────────────────────

  async listSubscriptions(): Promise<PlatformSubscriptionDto[]> {
    const institutions = await prisma.institution.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        settings: true,
        _count: { select: { users: true } },
        subscription: {
          select: {
            plan: true,
            startsAt: true,
            expiresAt: true,
            graceDays: true,
            suspendedAt: true,
            notes: true,
            payments: {
              orderBy: { createdAt: 'desc' },
              select: { status: true, createdAt: true },
            },
          },
        },
      },
    })

    return institutions.map((inst) => {
      const settings = (inst.settings ?? {}) as Record<string, unknown>
      const payments = inst.subscription?.payments ?? []
      const aiConfig = (settings.aiConfig ?? {}) as { enabled?: boolean }
      return {
        institutionId: inst.id,
        institutionName: inst.name,
        institutionCode: inst.code,
        accountType: settings.accountType === 'personal' ? 'personal' : 'institution',
        userCount: inst._count.users,
        status: inst.subscription ? computeSubscriptionStatus(inst.subscription) : null,
        // La suscripción real (ver approve/suspend en platform-subscription.routes.ts) —
        // status arriba es solo la vigencia registrada, ya sin efecto de bloqueo.
        aiEnabled: aiConfig.enabled === true,
        notes: inst.subscription?.notes ?? null,
        pendingPayments: payments.filter((p) => p.status === 'pending').length,
        lastPaymentAt: payments[0]?.createdAt.toISOString() ?? null,
      }
    })
  }

  async listPayments(status?: PaymentStatus): Promise<PendingPaymentDto[]> {
    const payments = await prisma.subscriptionPayment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: { include: { profile: true } },
        institution: { select: { name: true } },
        subscription: { select: { expiresAt: true } },
      },
    })
    return payments.map((p) => ({
      ...toPaymentDto(p),
      institutionId: p.institutionId,
      institutionName: p.institution.name,
      currentExpiresAt: p.subscription.expiresAt.toISOString(),
    }))
  }

  async findPaymentStoredName(
    paymentId: string,
  ): Promise<{ storedName: string; mimeType: string; fileName: string } | null> {
    return prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      select: { storedName: true, mimeType: true, fileName: true },
    })
  }

  /**
   * Aprueba el comprobante y mueve la vigencia en una sola transacción.
   *
   * También limpia suspendedAt: si la institución estaba cortada y paga, cobrar
   * sin devolverle el acceso sería el peor resultado posible.
   */
  async approvePayment(
    paymentId: string,
    adminId: string,
    dto: ApprovePaymentDto,
  ): Promise<{ institutionId: string }> {
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      select: { id: true, status: true, subscriptionId: true, institutionId: true },
    })
    if (!payment) throw new NotFoundError('Comprobante no encontrado')

    await prisma.$transaction([
      prisma.subscriptionPayment.update({
        where: { id: paymentId },
        data: {
          status: 'approved',
          amount: dto.amount ?? undefined,
          reviewedAt: new Date(),
          reviewedBy: adminId,
          reviewNotes: dto.reviewNotes ?? null,
        },
      }),
      prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          plan: 'paid',
          expiresAt: new Date(dto.expiresAt),
          suspendedAt: null,
        },
      }),
    ])

    return { institutionId: payment.institutionId }
  }

  async rejectPayment(
    paymentId: string,
    adminId: string,
    reviewNotes: string,
  ): Promise<{ institutionId: string }> {
    const payment = await prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
      select: { institutionId: true },
    })
    if (!payment) throw new NotFoundError('Comprobante no encontrado')

    await prisma.subscriptionPayment.update({
      where: { id: paymentId },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedBy: adminId,
        reviewNotes,
      },
    })
    return { institutionId: payment.institutionId }
  }

  /**
   * Fija la vigencia a mano, sin comprobante. Para los pagos que llegan por
   * fuera (WhatsApp, efectivo) y para poner bajo gestión a una institución que
   * todavía no tenía suscripción.
   */
  async setValidity(institutionId: string, dto: SetValidityDto): Promise<SubscriptionStatus> {
    const now = new Date()
    const sub = await prisma.subscription.upsert({
      where: { institutionId },
      create: {
        institutionId,
        plan: dto.plan ?? 'paid',
        startsAt: now,
        expiresAt: new Date(dto.expiresAt),
        graceDays: dto.graceDays ?? 7,
        notes: dto.notes ?? null,
      },
      update: {
        plan: dto.plan ?? undefined,
        expiresAt: new Date(dto.expiresAt),
        graceDays: dto.graceDays ?? undefined,
        notes: dto.notes ?? undefined,
      },
      select: { plan: true, startsAt: true, expiresAt: true, graceDays: true, suspendedAt: true },
    })
    return computeSubscriptionStatus(sub)
  }

  async setSuspended(institutionId: string, suspended: boolean): Promise<SubscriptionStatus> {
    const sub = await prisma.subscription.update({
      where: { institutionId },
      data: { suspendedAt: suspended ? new Date() : null },
      select: { plan: true, startsAt: true, expiresAt: true, graceDays: true, suspendedAt: true },
    })
    return computeSubscriptionStatus(sub)
  }
}
