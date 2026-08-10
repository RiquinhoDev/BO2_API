import express, { type Router } from 'express'
import type request from 'supertest'
import { asyncRoute, type AsyncRouteHandler } from '../../src/security/asyncRoute'
import { createErrorHandling } from '../../src/security/errorHandling'

export interface ExpectedCentralError {
  code: string
  message: string
  correlationId?: string
}

export function expectCentralError(
  response: request.Response,
  expected: ExpectedCentralError,
): void {
  const correlationId = expected.correlationId ?? 'sec10-request'
  expect(response.status).toBe(500)
  expect(response.headers['x-request-id']).toBe(correlationId)
  expect(response.body).toEqual({
    success: false,
    code: expected.code,
    message: expected.message,
    correlationId,
  })
  expect(JSON.stringify(response.body)).not.toMatch(
    /secret|alice@example\.test|token=hidden/,
  )
}

type HttpMethod = 'delete' | 'get' | 'patch' | 'post' | 'put'

export type CentralErrorRoute =
  | {
    kind: 'handler'
    handler: AsyncRouteHandler
    method?: HttpMethod
    path?: string
  }
  | {
    kind: 'router'
    mountPath?: string
    router: Router
  }

export function appForCentralError(
  route: CentralErrorRoute,
  correlationId = 'sec10-request',
): express.Express {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => correlationId,
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errors.correlationId)

  if (route.kind === 'handler') {
    app[route.method ?? 'get'](route.path ?? '/target', asyncRoute(route.handler))
  } else {
    app.use(route.mountPath ?? '/target', route.router)
  }

  app.use(errors.handler)
  return app
}
