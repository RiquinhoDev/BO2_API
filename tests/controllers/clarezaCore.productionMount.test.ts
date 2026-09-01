import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'

import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import ClarezaCoreGeneration from '../../src/models/ClarezaCoreGeneration'
import ClarezaCorePublication from '../../src/models/ClarezaCorePublication'
import { MongooseCoreGenerationStore } from '../../src/services/clareza/core/coreGenerationStore'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { appForCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()
import clarezaRouter from '../../src/routes/clareza.routes'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'clareza_core_http_dry_run_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('clareza_core_http_dry_run_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    ClarezaCoreGeneration.collection.deleteMany({}),
    ClarezaCorePublication.collection.deleteMany({}),
  ])
  const store = new MongooseCoreGenerationStore()
  await store.createCandidate({
    generationId: 'dry-run-generation',
    universeVersion: 'dry-run-universe',
    dataVersion: 'dry-run-data',
    createdAt: new Date('2026-09-01T18:00:00.000Z'),
    records: [{
      ticker: 'AAPL', kind: 'stock', datasets: {
        data: { price: 200 },
        evaluation: { valuation: { score: 77 }, quality: { score: 77 } },
        'annual-income': [{ date: '2025-12-31', revenue: 100 }],
        earnings: [{ date: '2026-07-31', epsActual: 2.1 }],
      },
    }],
  })
  await store.publishCandidate('dry-run-generation', null)
})

describe('Clareza core production mount offline dry-run', () => {
  const app = appForCentralError({ kind: 'router', mountPath: '/api/clareza', router: clarezaRouter })

  it('serves Radar, Carteira and bounded histories from one published Mongo generation', async () => {
    const [radar, carteira, analysis] = await Promise.all([
      request(app).get('/api/clareza/radar?__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/carteira/data?__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/carteira/analysis?symbols=AAPL&__bo2_offline_loopback=1').expect(200),
    ])

    expect(radar.body).toMatchObject({ generationId: 'dry-run-generation', count: 1 })
    expect(carteira.body).toMatchObject({ generationId: 'dry-run-generation', count: 1 })
    expect(analysis.body).toEqual({
      generationId: 'dry-run-generation',
      results: { AAPL: {
        income: [{ date: '2025-12-31', revenue: 100 }],
        incomeGrowth: [],
        earnings: [{ date: '2026-07-31', epsActual: 2.1 }],
      } },
      missing: [],
    })
    expect(radar.body.stocks[0].evaluation).toEqual(carteira.body.items[0].evaluation)
  })
})
