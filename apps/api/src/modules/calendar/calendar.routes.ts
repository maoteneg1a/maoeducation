import { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../shared/infrastructure/middleware/auth.middleware'
import { ForbiddenError, NotFoundError, BadRequestError } from '../../shared/domain/errors/app.errors'
import { isPrivilegedStaff } from '../../shared/infrastructure/services/teacher-scope.service'

const TYPES = ['holiday', 'exam', 'event', 'meeting', 'other']
const AUDIENCES = ['all', 'staff', 'families']

interface EventBody {
  title: string
  description?: string | null
  type?: string
  startDate: string
  endDate?: string | null
  audience?: string
}

const bodySchema = {
  type: 'object',
  required: ['title', 'startDate'],
  additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: ['string', 'null'], maxLength: 2000 },
    type: { type: 'string', enum: TYPES },
    startDate: { type: 'string', format: 'date' },
    endDate: { type: ['string', 'null'], format: 'date' },
    audience: { type: 'string', enum: AUDIENCES },
  },
} as const

/** Gestionan el calendario: admin, rector, inspección y DECE. */
function assertCanManage(req: FastifyRequest) {
  if (!isPrivilegedStaff(req.user.roles)) throw new ForbiddenError('Solo la administración puede editar el calendario')
}

function isFamily(roles: string[]) {
  return (roles.includes('student') || roles.includes('guardian')) && !roles.some((r) => !['student', 'guardian'].includes(r))
}

function toData(body: EventBody) {
  if (body.endDate && body.endDate < body.startDate) throw new BadRequestError('La fecha de fin no puede ser anterior al inicio')
  return {
    title: body.title.trim(),
    description: body.description?.trim() || null,
    type: body.type ?? 'event',
    startDate: new Date(body.startDate),
    endDate: body.endDate ? new Date(body.endDate) : null,
    audience: body.audience ?? 'all',
  }
}

export default async function calendarRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Querystring: { from: string; to: string } }>(
    '/calendar/events',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['from', 'to'],
          properties: { from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' } },
        },
      },
    },
    async (req) => {
      const { institutionId, roles } = req.user
      const audience = isFamily(roles) ? ['all', 'families'] : ['all', 'staff']
      const from = new Date(req.query.from)
      const to = new Date(req.query.to)
      const events = await prisma.calendarEvent.findMany({
        where: {
          institutionId,
          audience: { in: isPrivilegedStaff(roles) ? AUDIENCES : audience },
          startDate: { lte: to },
          OR: [{ endDate: { gte: from } }, { endDate: null, startDate: { gte: from } }],
        },
        orderBy: { startDate: 'asc' },
      })
      return events.map((e) => ({
        ...e,
        startDate: e.startDate.toISOString().slice(0, 10),
        endDate: e.endDate ? e.endDate.toISOString().slice(0, 10) : null,
      }))
    },
  )

  app.post<{ Body: EventBody }>('/calendar/events', { schema: { body: bodySchema } }, async (req, reply) => {
    assertCanManage(req)
    const event = await prisma.calendarEvent.create({
      data: { ...toData(req.body), institutionId: req.user.institutionId, createdBy: req.user.sub },
    })
    return reply.status(201).send(event)
  })

  app.put<{ Params: { id: string }; Body: EventBody }>('/calendar/events/:id', { schema: { body: bodySchema } }, async (req) => {
    assertCanManage(req)
    const existing = await prisma.calendarEvent.findFirst({ where: { id: req.params.id, institutionId: req.user.institutionId } })
    if (!existing) throw new NotFoundError('Evento no encontrado')
    return prisma.calendarEvent.update({ where: { id: existing.id }, data: toData(req.body) })
  })

  app.delete<{ Params: { id: string } }>('/calendar/events/:id', async (req, reply) => {
    assertCanManage(req)
    const res = await prisma.calendarEvent.deleteMany({ where: { id: req.params.id, institutionId: req.user.institutionId } })
    if (res.count === 0) throw new NotFoundError('Evento no encontrado')
    return reply.status(204).send()
  })
}
