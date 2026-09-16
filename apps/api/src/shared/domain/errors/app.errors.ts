export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso no encontrado') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'No autorizado') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acceso denegado') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message, 422, 'VALIDATION_ERROR')
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT')
  }
}

export class BadRequestError extends AppError {
  constructor(message: string) {
    super(message, 400, 'BAD_REQUEST')
  }
}

/**
 * La suscripción de la institución no permite escribir (venció la tolerancia o
 * está suspendida). 402 y no 403: no es un problema de permisos del usuario,
 * es la cuenta la que está en solo-lectura.
 */
export class SubscriptionInactiveError extends AppError {
  constructor(message = 'La suscripción venció. Puedes consultar y exportar, pero no registrar cambios.') {
    super(message, 402, 'SUBSCRIPTION_INACTIVE')
  }
}
