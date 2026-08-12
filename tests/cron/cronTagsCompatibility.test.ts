import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'
import cronTagsRouter from '../../src/routes/cron/cronManagement.routes'
installTestRuntimeConfigHooks()

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/cron-tags', cronTagsRouter)
  return app
}

test('removed cron-tags execute tombstone is absent from the HTTP surface', async () => {
  const response = await request(buildApp())
    .post('/api/cron-tags/execute')
    .query({ __bo2_offline_loopback: '1' })
    .send({ userId: 'admin-1' })

  expect(response.status).toBe(404)
})