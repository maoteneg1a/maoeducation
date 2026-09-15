import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { PrismaInstitutionRepository } from '../infrastructure/repositories/prisma-institution.repository'
import type {
  UpdateAiConfigDto,
  UpdateGradingConfigDto,
  UpdateInstitutionSettingsDto,
  UpdatePlanningModelDto,
} from '../application/dtos/institution.dto'

const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
const MAX_LOGO_BYTES = 500 * 1024 // 500 KB (se guarda en BD como data URI)

export default async function institutionRoutes(app: FastifyInstance) {
  const repo = new PrismaInstitutionRepository()

  app.addHook('preHandler', authMiddleware)

  // GET /institution/settings — cualquiera autenticado de la institución
  app.get('/institution/settings', async (req, reply) => {
    return reply.send(await repo.getSettings(req.user.institutionId))
  })

  // PUT /institution/settings — solo admin (institution_config:manage)
  app.put<{ Body: UpdateInstitutionSettingsDto }>(
    '/institution/settings',
    {
      preHandler: [requirePermission('institution_config', 'manage')],
      schema: {
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 2 },
            branding: {
              type: 'object',
              properties: {
                logoUrl: { type: ['string', 'null'] },
                primaryColor: { type: ['string', 'null'] },
                sidebarColor: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      return reply.send(await repo.updateSettings(req.user.institutionId, req.body))
    },
  )

  // GET /institution/grading-config — config de calificación (cualquiera autenticado)
  app.get('/institution/grading-config', async (req, reply) => {
    return reply.send(await repo.getGradingConfig(req.user.institutionId))
  })

  // PUT /institution/grading-config — solo admin
  app.put<{ Body: UpdateGradingConfigDto }>(
    '/institution/grading-config',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      return reply.send(await repo.updateGradingConfig(req.user.institutionId, req.body))
    },
  )

  // GET /institution/ai-config — cualquiera autenticado (para saber si mostrar el botón de IA)
  app.get('/institution/ai-config', async (req, reply) => {
    return reply.send(await repo.getAiConfig(req.user.institutionId))
  })

  // PUT /institution/ai-config — solo admin
  app.put<{ Body: UpdateAiConfigDto }>(
    '/institution/ai-config',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      return reply.send(await repo.updateAiConfig(req.user.institutionId, req.body))
    },
  )

  // GET /institution/planning-model — cualquiera autenticado (para saber qué selector mostrar)
  app.get('/institution/planning-model', async (req, reply) => {
    return reply.send({ planningModel: await repo.getPlanningModel(req.user.institutionId) })
  })

  // PUT /institution/planning-model — solo admin
  app.put<{ Body: UpdatePlanningModelDto }>(
    '/institution/planning-model',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const planningModel = await repo.updatePlanningModel(req.user.institutionId, req.body)
      return reply.send({ planningModel })
    },
  )

  // POST /institution/logo — subir logo (multipart)
  app.post(
    '/institution/logo',
    { preHandler: [requirePermission('institution_config', 'manage')] },
    async (req, reply) => {
      const data = await req.file()
      if (!data) return reply.status(400).send({ message: 'No se recibió ningún archivo' })
      if (!ALLOWED_LOGO_MIME.includes(data.mimetype)) {
        return reply.status(400).send({ message: 'Formato no permitido (usa PNG, JPG, SVG o WebP)' })
      }

      // Guardamos el logo como data URI en la BD (no en disco): el disco de
      // muchos hostings (Railway, Vercel...) es efímero y borra los archivos.
      const buf = await data.toBuffer()
      if (buf.length > MAX_LOGO_BYTES) {
        return reply.status(400).send({ message: 'El logo no debe superar 500 KB' })
      }
      const logoUrl = `data:${data.mimetype};base64,${buf.toString('base64')}`
      await repo.setLogoUrl(req.user.institutionId, logoUrl)
      return reply.status(201).send({ logoUrl })
    },
  )
}
