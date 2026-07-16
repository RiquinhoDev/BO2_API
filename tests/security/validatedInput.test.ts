import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  validatedSchema,
  withValidatedInput,
} from '../../src/security/validatedInput'

const destructiveInput = validatedSchema({
  params: {},
  query: {},
  body: { name: z.string() },
})

function buildApp(onValidated = jest.fn()) {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'validation-correlation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.post(
    '/destructive',
    withValidatedInput(destructiveInput, (input, _req, res) => {
      onValidated(input)
      res.status(204).end()
    }),
  )
  app.use(errors.handler)
  return app
}

const offlineMarker = { __bo2_offline_loopback: '1' }

test('validatedSchema makes every input shape strict centrally', () => {
  const schema = validatedSchema({
    params: {},
    query: {},
    body: { name: z.string() },
  })

  expect(schema.safeParse({
    params: {},
    query: {},
    body: { name: 'Alice', role: 'SUPER_ADMIN' },
  }).success).toBe(false)
})

test('rejects an extra role field instead of stripping it', async () => {
  const onValidated = jest.fn()
  const response = await request(buildApp(onValidated))
    .post('/destructive')
    .query(offlineMarker)
    .send({ name: 'Alice', role: 'SUPER_ADMIN' })
    .expect(400)

  expect(response.body).toEqual({
    success: false,
    code: 'INVALID_REQUEST',
    message: 'Pedido inválido',
    correlationId: 'validation-correlation-id',
  })
  expect(onValidated).not.toHaveBeenCalled()
})

test('removes the offline marker before generic operator guarding and Zod', async () => {
  const onValidated = jest.fn()

  await request(buildApp(onValidated))
    .post('/destructive')
    .query(offlineMarker)
    .send({ name: 'Alice' })
    .expect(204)

  expect(onValidated).toHaveBeenCalledWith({
    params: {},
    query: {},
    body: { name: 'Alice' },
  })
})

test('rejects Mongo operators without coupling the guard to the marker name', async () => {
  const onValidated = jest.fn()

  await request(buildApp(onValidated))
    .post('/destructive')
    .query(offlineMarker)
    .send({ name: 'Alice', nested: { $where: 'unsafe' } })
    .expect(400)

  expect(onValidated).not.toHaveBeenCalled()
})

test('rejects an own __proto__ key parsed from literal JSON', async () => {
  const onValidated = jest.fn()
  const payload = JSON.parse('{"name":"Alice","__proto__":{"polluted":true}}')

  expect(Object.getOwnPropertyNames(payload)).toContain('__proto__')

  await request(buildApp(onValidated))
    .post('/destructive')
    .query(offlineMarker)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload))
    .expect(400)

  expect(onValidated).not.toHaveBeenCalled()
})

test('forwards handler failures without misclassifying them as invalid input', async () => {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'handler-correlation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.post(
    '/destructive',
    withValidatedInput(destructiveInput, async () => {
      throw new Error('database failed')
    }),
  )
  app.use(errors.handler)

  const response = await request(app)
    .post('/destructive')
    .query(offlineMarker)
    .send({ name: 'Alice' })
    .expect(500)

  expect(response.body).toEqual({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Erro interno do servidor',
    correlationId: 'handler-correlation-id',
  })
})

test('runs the operator guard before invoking Zod', async () => {
  const schema = validatedSchema({
    params: {},
    query: {},
    body: {
      name: z.string(),
      nested: z.unknown(),
    },
  })
  const safeParse = jest.spyOn(schema, 'safeParse')
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'order-correlation-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.post(
    '/destructive',
    withValidatedInput(schema, (_input, _req, res) => {
      res.status(204).end()
    }),
  )
  app.use(errors.handler)

  await request(app)
    .post('/destructive')
    .query(offlineMarker)
    .send({ name: 'Alice', nested: { $where: 'unsafe' } })
    .expect(400)

  expect(safeParse).not.toHaveBeenCalled()
})
