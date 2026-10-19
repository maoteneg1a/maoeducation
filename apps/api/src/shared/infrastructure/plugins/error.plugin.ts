import { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { Prisma } from '@prisma/client'
import { AppError } from '../../domain/errors/app.errors'

export const errorPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.code === 'VALIDATION_ERROR' && 'fields' in error
            ? { fields: (error as { fields?: unknown }).fields }
            : {}),
        },
      })
    }

    // Errores de validación del schema de Fastify (Zod/JSON Schema)
    if (error.statusCode === 400 && error.validation) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Datos de entrada inválidos',
          fields: error.validation,
        },
      })
    }

    // Rate limiting (@fastify/rate-limit) y otros errores HTTP con statusCode < 500
    // que ya traen un cuerpo pensado para el cliente.
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intenta de nuevo en un momento.' },
      })
    }

    // Errores conocidos de Prisma → respuestas claras en vez de 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: 'Ya existe un registro con esos datos' },
        })
      }
      if (error.code === 'P2003' || error.code === 'P2014') {
        return reply.status(409).send({
          error: {
            code: 'CONFLICT',
            message: 'No se puede completar: hay registros relacionados (por ejemplo notas, asistencia o actividades) que dependen de este elemento',
          },
        })
      }
      if (error.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' },
        })
      }
    }

    // Error inesperado
    req.log.error({ err: error, reqId: req.id }, 'Unhandled error')
    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      },
    })
  })
})
