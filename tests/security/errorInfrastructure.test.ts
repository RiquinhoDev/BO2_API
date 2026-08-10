import type { NextFunction, Request, Response } from 'express'
import request from 'supertest'
import { createApp } from '../../src/app'
import { asyncRoute } from '../../src/security/asyncRoute'
import {
  createErrorHandling,
  internalError,
  type ErrorLogEvent,
} from '../../src/security/errorHandling'

const marker = { __bo2_offline_loopback: '1' }

test('asyncRoute forwards an asynchronous rejection exactly once', async () => {
  const cause = new Error('async failure')
  const next = jest.fn() as jest.MockedFunction<NextFunction>
  const wrapped = asyncRoute(async () => {
    throw cause
  })

  wrapped({} as Request, {} as Response, next)
  await new Promise(process.nextTick)

  expect(next).toHaveBeenCalledTimes(1)
  expect(next).toHaveBeenCalledWith(cause)
})

test('asyncRoute forwards a synchronous throw exactly once', async () => {
  const cause = new Error('sync failure')
  const next = jest.fn() as jest.MockedFunction<NextFunction>
  const wrapped = asyncRoute(() => {
    throw cause
  })

  wrapped({} as Request, {} as Response, next)
  await new Promise(process.nextTick)

  expect(next).toHaveBeenCalledTimes(1)
  expect(next).toHaveBeenCalledWith(cause)
})

test('internalError exposes only stable public fields and logs a redacted cause', async () => {
  const events: ErrorLogEvent[] = []
  const errors = createErrorHandling({
    generateCorrelationId: () => 'central-error-request',
    logError: (event) => events.push(event),
  })
  const app = createApp({
    createErrorHandling: () => errors,
    registerRoutes: (target) => {
      target.get('/factory', (_req, _res, next) => {
        next(
          internalError(
            'Falha ao carregar dados',
            'DATA_LOAD_FAILED',
            new Error('alice@example.test token=private-value'),
          ),
        )
      })
    },
  })

  const response = await request(app).get('/factory').query(marker).expect(500)

  expect(response.body).toEqual({
    success: false,
    code: 'DATA_LOAD_FAILED',
    message: 'Falha ao carregar dados',
    correlationId: 'central-error-request',
  })
  expect(response.text).not.toContain('alice@example.test')
  expect(response.text).not.toContain('private-value')
  expect(events[0]?.detail).toBe('[REDACTED_EMAIL] token=[REDACTED]')
})

test('final handler delegates when headers have already been sent', () => {
  const next = jest.fn() as jest.MockedFunction<NextFunction>
  const cause = new Error('stream failed')
  const response = { headersSent: true } as Response
  const handler = createErrorHandling({ logError: jest.fn() }).handler

  handler(cause, {} as Request, response, next)

  expect(next).toHaveBeenCalledTimes(1)
  expect(next).toHaveBeenCalledWith(cause)
})
