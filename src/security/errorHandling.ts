import { randomUUID } from 'node:crypto'
import type { ErrorRequestHandler, RequestHandler } from 'express'
import { redactSensitiveData } from '../observability/redaction'
import { logHttpError } from '../utils/logger'

export interface HttpErrorOptions {
  status: number
  code: string
  publicMessage: string
  cause?: unknown
}

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly publicMessage: string
  readonly internalCause?: unknown

  constructor(options: HttpErrorOptions) {
    super(options.publicMessage)
    this.name = 'HttpError'
    this.status = options.status
    this.code = options.code
    this.publicMessage = options.publicMessage
    this.internalCause = options.cause
  }
}

export interface ErrorLogEvent {
  correlationId: string
  code: string
  status: number
  method: string
  route: string
  detail: string
}

export interface ErrorHandling {
  correlationId: RequestHandler
  handler: ErrorRequestHandler
}

export interface ErrorHandlingOptions {
  generateCorrelationId?: () => string
  logError?: (event: ErrorLogEvent) => void
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

function getErrorDetail(error: unknown): string {
  if (error instanceof HttpError && error.internalCause instanceof Error) {
    return error.internalCause.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function classifyError(error: unknown): Pick<HttpErrorOptions, 'status' | 'code' | 'publicMessage'> {
  if (error instanceof HttpError) return error
  if (error instanceof Error && 'type' in error && error.type === 'entity.too.large') {
    return {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      publicMessage: 'Pedido demasiado grande',
    }
  }
  if (error instanceof Error && 'type' in error && error.type === 'entity.parse.failed') {
    return {
      status: 400,
      code: 'INVALID_JSON',
      publicMessage: 'JSON inválido',
    }
  }
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    publicMessage: 'Erro interno do servidor',
  }
}

export function createErrorHandling(options: ErrorHandlingOptions = {}): ErrorHandling {
  const generateCorrelationId = options.generateCorrelationId ?? randomUUID
  const logError = options.logError ?? logHttpError

  const correlationId: RequestHandler = (req, res, next) => {
    const incoming = req.get('x-request-id')
    const value = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : generateCorrelationId()
    res.locals.correlationId = value
    res.setHeader('X-Request-ID', value)
    next()
  }

  const handler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent) return next(error)

    const correlation = res.locals.correlationId || generateCorrelationId()
    const { status, code, publicMessage: message } = classifyError(error)

    res.setHeader('X-Request-ID', correlation)
    logError(redactSensitiveData({
      correlationId: correlation,
      code,
      status,
      method: req.method,
      route: typeof req.route?.path === 'string' ? req.route.path : '[unmatched]',
      detail: getErrorDetail(error).slice(0, 2_048),
    }))
    res.status(status).json({ success: false, code, message, correlationId: correlation })
  }

  return { correlationId, handler }
}
