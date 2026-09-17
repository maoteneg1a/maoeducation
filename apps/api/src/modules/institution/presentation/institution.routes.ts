import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { ForbiddenError } from '../../../shared/domain/errors/app.errors'
import { PrismaInstitutionRepository } from '../infrastructure/repositories/prisma-institution.repository'
import { buildMicrocurricularPdf } from '../../planning/application/services/microcurricular-pdf.service'
import type {
  MicrocurricularTemplateConfig,
  UpdateAiConfigDto,
  UpdateGradingConfigDto,
  UpdateInstitutionSettingsDto,
  UpdateMicrocurricularTemplateDto,
  UpdatePlanningModelDto,
} from '../application/dtos/institution.dto'

/** Situación + semana de ejemplo — se usa en el preview de la plantilla para no
 * requerir que el admin ya tenga una planificación real creada. */
function sampleMicrocurricularData(institutionName: string, logoUrl: string | null) {
  return {
    institutionName,
    logoUrl,
    yearName: '2026-2027',
    teacherName: 'Nombre del Docente',
    subjectName: 'Matemática',
    levelName: '5to de Básica',
    parallelName: 'A',
    periodName: 'Primer Trimestre',
    situationTitle: 'Situación de aprendizaje de ejemplo',
    situationDescription: 'Descripción breve del contexto y el reto que aborda esta situación de aprendizaje.',
    interdisciplinaryAreaNames: ['Lengua y Literatura', 'Ciencias Naturales'],
    weeks: [
      {
        weekNumber: 1,
        name: null,
        startDate: null,
        endDate: null,
        competenciasEspecificas: 'CE.M.3.1 Resolver problemas de la vida cotidiana mediante el uso de estrategias de cálculo.',
        indicadoresEvaluacion: 'Aplica estrategias de cálculo mental y algoritmos convencionales.',
        saberes: [
          { type: 'declarativo' as const, code: 'M.3.1.d.1', description: 'Operaciones básicas con números naturales.' },
          { type: 'procedimental' as const, code: 'M.3.1.p.1', description: 'Resolución de problemas mediante cálculo mental.' },
          { type: 'actitudinal' as const, code: 'M.3.1.a.1', description: 'Valoración del pensamiento lógico-matemático.' },
        ],
        momentos: {
          anticipacion: { estrategiasDua: 'Activar conocimientos previos con una situación cotidiana.', recursos: 'Pizarra, cuaderno', tecnica: 'Observación', instrumento: 'Lista de cotejo' },
          construccionConocimiento: { estrategiasDua: 'Trabajo colaborativo en grupos pequeños.', recursos: 'Fichas de trabajo', tecnica: 'Prueba', instrumento: 'Rúbrica' },
          consolidacion: { estrategiasDua: 'Reflexión y autoevaluación final.', recursos: 'Cuaderno de trabajo', tecnica: 'Autoevaluación', instrumento: 'Escala de valoración' },
        },
      },
    ],
    signatories: [
      { role: 'Elaborado por: Docente(s)', name: 'Nombre del Docente', date: null },
      { role: 'Revisado por: Director de área/subnivel', name: null, date: null },
      { role: 'Aprobado por: Subdirección', name: null, date: null },
    ],
  }
}

const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
const MAX_LOGO_BYTES = 500 * 1024 // 500 KB (se guarda en BD como data URI)

// El banner de encabezado es una imagen ancha (todo el ancho de la página) —
// se permite un poco más de peso que el logo para no degradar demasiado su
// calidad visual, pero sigue guardándose como data URI en BD (mismo patrón
// que el logo, sin usar el storage service de disco/S3 — ver ALLOWED_LOGO_MIME).
const ALLOWED_BANNER_MIME = ALLOWED_LOGO_MIME
const MAX_BANNER_BYTES = 1024 * 1024 // 1 MB

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

  // GET /institution/document-templates/microcurricular — cualquiera autenticado (se usa al generar el PDF)
  app.get('/institution/document-templates/microcurricular', async (req, reply) => {
    return reply.send(await repo.getMicrocurricularTemplate(req.user.institutionId))
  })

  // PUT /institution/document-templates/microcurricular — solo admin
  app.put<{ Body: UpdateMicrocurricularTemplateDto }>(
    '/institution/document-templates/microcurricular',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      return reply.send(await repo.updateMicrocurricularTemplate(req.user.institutionId, req.body))
    },
  )

  // POST /institution/document-templates/microcurricular/preview — solo admin
  // Recibe una plantilla candidata (aún no guardada) y devuelve un PDF de ejemplo,
  // así el admin ve el resultado antes de decidir si guardarla.
  app.post<{ Body: MicrocurricularTemplateConfig }>(
    '/institution/document-templates/microcurricular/preview',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const settings = await repo.getSettings(req.user.institutionId)
      const sample = sampleMicrocurricularData(settings.name, settings.branding.logoUrl ?? null)
      const pdf = await buildMicrocurricularPdf(sample, req.body)
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', 'inline; filename="preview.pdf"')
        .send(pdf)
    },
  )

  // GET /institution/ai-config — cualquiera autenticado (para saber si mostrar el botón de IA)
  app.get('/institution/ai-config', async (req, reply) => {
    return reply.send(await repo.getAiConfig(req.user.institutionId))
  })

  // PUT /institution/ai-config — ya NO editable por el admin de la institución.
  // El control de IA (habilitar, modelo, tope de tokens) lo gestiona el
  // superadministrador de plataforma vía PUT /platform/institutions/:id/ai-config
  // (mismo repo/lógica, ver platform.routes.ts) — decisión de costo/riesgo que
  // no debe quedar en manos de cada institución.
  app.put<{ Body: UpdateAiConfigDto }>(
    '/institution/ai-config',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async () => {
      throw new ForbiddenError('Esta configuración ahora la gestiona el superadministrador de la plataforma')
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

  // POST /institution/document-templates/microcurricular/header-banner — subir
  // el banner de encabezado completo (imagen ya diseñada por la institución:
  // fondo, ondas, logo, nombre, caja de datos institucionales...). Mismo patrón
  // que /institution/logo — se guarda como data URI en la plantilla (BD), no en
  // disco. Reemplaza el bloque superior (logo pequeño + nombre en texto) del PDF.
  app.post(
    '/institution/document-templates/microcurricular/header-banner',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const data = await req.file()
      if (!data) return reply.status(400).send({ message: 'No se recibió ningún archivo' })
      if (!ALLOWED_BANNER_MIME.includes(data.mimetype)) {
        return reply.status(400).send({ message: 'Formato no permitido (usa PNG, JPG, SVG o WebP)' })
      }

      const buf = await data.toBuffer()
      if (buf.length > MAX_BANNER_BYTES) {
        return reply.status(400).send({ message: 'El banner no debe superar 1 MB' })
      }
      const headerBannerUrl = `data:${data.mimetype};base64,${buf.toString('base64')}`
      const template = await repo.updateMicrocurricularTemplate(req.user.institutionId, { headerBannerUrl })
      return reply.status(201).send({ headerBannerUrl, template })
    },
  )

  // DELETE /institution/document-templates/microcurricular/header-banner — quitar
  // el banner y volver al encabezado por defecto (logo pequeño + nombre en texto).
  app.delete(
    '/institution/document-templates/microcurricular/header-banner',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const template = await repo.updateMicrocurricularTemplate(req.user.institutionId, { headerBannerUrl: null })
      return reply.send({ template })
    },
  )
}
