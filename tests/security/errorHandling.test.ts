import request from 'supertest'
import { createApp } from '../../src/app'
import {
  HttpError,
  createErrorHandling,
  type ErrorLogEvent,
} from '../../src/security/errorHandling'
import * as redaction from '../../src/observability/redaction'
import * as loggerModule from '../../src/utils/logger'

const marker = { __bo2_offline_loopback: '1' }

function buildApp(logError: (event: ErrorLogEvent) => void) {
  return createApp({
    createErrorHandling: () =>
      createErrorHandling({
        generateCorrelationId: () => 'generated-correlation-id',
        logError,
      }),
    registerRoutes: (app) => {
      app.get('/internal', () => {
        throw new Error('mongo falhou para alice@example.test token=segredo-interno')
      })
      app.get('/typed', (_req, _res, next) => {
        next(
          new HttpError({
            status: 422,
            code: 'INVALID_INPUT',
            publicMessage: 'Pedido inválido',
            cause: new Error('contacto bob%40example.test Authorization: Bearer abc.def'),
          }),
        )
      })
    },
  })
}

test('erro interno devolve envelope estável sem expor o detalhe cru', async () => {
  const events: ErrorLogEvent[] = []
  const response = await request(buildApp((event) => events.push(event)))
    .get('/internal')
    .query(marker)
    .expect(500)

  expect(response.body).toEqual({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
    correlationId: 'generated-correlation-id',
  })
  expect(response.text).not.toContain('mongo falhou')
  expect(response.text).not.toContain('alice@example.test')
  expect(response.headers['x-request-id']).toBe('generated-correlation-id')
  expect(events).toEqual([
    {
      correlationId: 'generated-correlation-id',
      code: 'INTERNAL_ERROR',
      status: 500,
      method: 'GET',
      route: '/internal',
      detail: 'mongo falhou para [REDACTED_EMAIL] token=[REDACTED]',
    },
  ])
})

test('erro tipado preserva só a mensagem pública e redige a causa no log', async () => {
  const events: ErrorLogEvent[] = []
  const response = await request(buildApp((event) => events.push(event)))
    .get('/typed')
    .set('X-Request-ID', 'client-request-123')
    .query(marker)
    .expect(422)

  expect(response.body).toEqual({
    success: false,
    code: 'INVALID_INPUT',
    message: 'Pedido inválido',
    correlationId: 'client-request-123',
  })
  expect(response.text).not.toContain('bob%40example.test')
  expect(response.text).not.toContain('abc.def')
  expect(events[0]).toEqual({
    correlationId: 'client-request-123',
    code: 'INVALID_INPUT',
    status: 422,
    method: 'GET',
    route: '/typed',
    detail: 'contacto [REDACTED_EMAIL] Authorization: Bearer [REDACTED]',
  })
})

test('error handler consome a função única de redação', async () => {
  const redact = jest.spyOn(redaction, 'redactSensitiveData')

  await request(buildApp(() => undefined)).get('/internal').query(marker).expect(500)

  expect(redact).toHaveBeenCalledWith(
    expect.objectContaining({
      detail: 'mongo falhou para alice@example.test token=segredo-interno',
    }),
  )
  redact.mockRestore()
})

test('error handler aponta por defeito para o logger único', async () => {
  const logHttpError = jest.spyOn(loggerModule, 'logHttpError').mockImplementation(() => undefined)
  const app = createApp({
    registerRoutes: (target) => {
      target.get('/default-logger', () => {
        throw new Error('falha interna')
      })
    },
  })

  await request(app).get('/default-logger').query(marker).expect(500)

  expect(logHttpError).toHaveBeenCalledWith(
    expect.objectContaining({ code: 'INTERNAL_ERROR', route: '/default-logger' }),
  )
  logHttpError.mockRestore()
})
