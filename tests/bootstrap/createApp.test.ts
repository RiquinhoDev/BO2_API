import mongoose from 'mongoose'
import request from 'supertest'
import { createApp } from '../../src/app'

test('importar e criar a app não regista modelos nem liga ao Mongo', async () => {
  expect(mongoose.modelNames()).toEqual([])
  expect(mongoose.connection.readyState).toBe(0)

  const app = createApp({
    registerRoutes: (target) => {
      target.get('/__offline_probe', (_req, res) => res.status(200).json({ ok: true }))
    },
  })

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener))
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Servidor Supertest sem porta TCP')

  try {
    await request(server)
      .get('/__offline_probe')
      .query({ __bo2_offline_loopback: '1' })
      .expect(200, { ok: true })
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
  expect(mongoose.modelNames()).toEqual([])
  expect(mongoose.connection.readyState).toBe(0)
})

test('createApp não exige configuração de infraestrutura', () => {
  const previousMongoUri = process.env.MONGO_URI
  delete process.env.MONGO_URI

  try {
    expect(() => createApp({ registerRoutes: () => undefined })).not.toThrow()
  } finally {
    if (previousMongoUri === undefined) delete process.env.MONGO_URI
    else process.env.MONGO_URI = previousMongoUri
  }
})
