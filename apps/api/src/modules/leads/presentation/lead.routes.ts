import { FastifyInstance } from 'fastify'
import { LEAD_STATUSES } from '../domain/entities/lead.entity'
import { platformAuthMiddleware } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { PrismaLeadRepository } from '../infrastructure/repositories/prisma-lead.repository'
import { CreateLeadUseCase } from '../application/use-cases/create-lead.use-case'
import { CreateLeadDto } from '../application/dtos/create-lead.dto'

// Body de la landing. `website` es un honeypot anti-spam: los humanos no lo ven,
// los bots sí lo llenan → si viene con contenido, descartamos silenciosamente.
interface CreateLeadBody extends CreateLeadDto {
  website?: string
}

export default async function leadRoutes(app: FastifyInstance) {
  const repo = new PrismaLeadRepository()
  const createLead = new CreateLeadUseCase(repo)

  // POST /leads — PÚBLICO (sin auth). Desde la landing auleka.com.
  app.post<{ Body: CreateLeadBody }>(
    '/leads',
    {
      // Formulario público: límite por IP contra spam.
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['name', 'email'],
          properties: {
            name:            { type: 'string', minLength: 2, maxLength: 150 },
            email:           { type: 'string', format: 'email', maxLength: 255 },
            phone:           { type: 'string', maxLength: 50 },
            institutionName: { type: 'string', maxLength: 200 },
            city:            { type: 'string', maxLength: 100 },
            role:            { type: 'string', maxLength: 80 },
            studentsCount:   { type: 'integer', minimum: 0, maximum: 100000 },
            message:         { type: 'string', maxLength: 2000 },
            source:          { type: 'string', maxLength: 50 },
            website:         { type: 'string' }, // honeypot
          },
        },
      },
    },
    async (req, reply) => {
      const { website, ...data } = req.body

      // Honeypot lleno → bot. Respondemos 201 sin crear nada (no le damos pistas).
      if (website && website.trim().length > 0) {
        return reply.status(201).send({ ok: true })
      }

      await createLead.execute(data)
      req.log.info({ source: data.source ?? 'landing' }, 'nuevo lead')
      return reply.status(201).send({ ok: true })
    },
  )

  // GET /leads — solo superadmin de plataforma.
  app.get('/leads', { preHandler: [platformAuthMiddleware] }, async (_req, reply) => {
    return reply.send(await repo.list())
  })

  // PATCH /leads/:id/status — actualizar estado del lead.
  app.patch<{ Params: { id: string }; Body: { status: string } }>(
    '/leads/:id/status',
    {
      preHandler: [platformAuthMiddleware],
      schema: {
        body: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: [...LEAD_STATUSES] } } },
      },
    },
    async (req, reply) => {
      return reply.send(await repo.updateStatus(req.params.id, req.body.status))
    },
  )

  // PATCH /leads/:id — CRM: notas, responsable, próximo seguimiento, conversión.
  app.patch<{
    Params: { id: string }
    Body: { status?: string; notes?: string | null; ownerAdminId?: string | null; nextFollowUpAt?: string | null; convertedInstitutionId?: string | null }
  }>(
    '/leads/:id',
    {
      preHandler: [platformAuthMiddleware],
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: [...LEAD_STATUSES] },
            notes: { type: ['string', 'null'], maxLength: 5000 },
            ownerAdminId: { type: ['string', 'null'] },
            nextFollowUpAt: { type: ['string', 'null'], format: 'date-time' },
            convertedInstitutionId: { type: ['string', 'null'] },
          },
        },
      },
    },
    async (req, reply) => {
      const { nextFollowUpAt, ...rest } = req.body
      return reply.send(
        await repo.update(req.params.id, {
          ...rest,
          ...(nextFollowUpAt !== undefined ? { nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null } : {}),
          ...(rest.convertedInstitutionId ? { status: 'closed_won' } : {}),
        }),
      )
    },
  )
}
