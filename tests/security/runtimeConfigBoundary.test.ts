import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  validatedSchema,
  withValidatedInput,
} from '../../src/security/validatedInput'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

const schema = validatedSchema({
  params: {},
  query: {},
  body: { name: z.string() },
})

const offlineMarker = { __bo2_offline_loopback: '1' }

function buildApp(onValidated: jest.Mock): express.Express {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'runtime-config-boundary-id',
    logError: () => undefined,
  })

  app.use(errors.correlationId)
  app.use(express.json())
  app.post(
    '/destructive',
    withValidatedInput(schema, (input, _req, res) => {
      onValidated(input)
      res.status(204).end()
    }),
  )
  app.use(errors.handler)
  return app
}

afterEach(() => {
  resetRuntimeConfigForTests()
})

test('validated input uses typed node environment instead of ambient NODE_ENV at request time', async () => {
  useTestRuntimeConfig({ nodeEnv: 'development' })
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'test'

  try {
    const onValidated = jest.fn()
    await request(buildApp(onValidated))
      .post('/destructive')
      .query(offlineMarker)
      .send({ name: 'Alice' })
      .expect(400)

    expect(onValidated).not.toHaveBeenCalled()
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
})
