import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'

import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import ClarezaCoreGeneration from '../../src/models/ClarezaCoreGeneration'
import ClarezaCorePublication from '../../src/models/ClarezaCorePublication'
import ClarezaCoreAliasState from '../../src/models/ClarezaCoreAliasState'
import ClarezaCoreRaioxCompanion from '../../src/models/ClarezaCoreRaioxCompanion'
import { MongooseCoreAliasStore } from '../../src/services/clareza/core/coreAliasStore'
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
    ClarezaCoreAliasState.collection.deleteMany({}),
    ClarezaCoreRaioxCompanion.collection.deleteMany({}),
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
  await ClarezaCoreRaioxCompanion.create([{
    generationId: 'dry-run-generation', ticker: 'AAPL',
    createdAt: new Date('2026-09-01T18:10:00.000Z'), sectorPe: [],
    data: {
      profileExtra: { country: 'US' }, forwardPe: 20,
      annualIncome: [], annualCashFlow: [], quarterlyIncome: [], quarterlyCashFlow: [],
      annualRatios: [], gradesConsensus: {}, priceTargetConsensus: {}, earnings: [],
      dividends: [], peerRatios: {}, momentum: null, segmentation: [],
      updated: '2026-09-01T18:10:00.000Z',
    },
  }, {
    generationId: 'dry-run-generation', ticker: '__META__',
    createdAt: new Date('2026-09-01T18:10:00.000Z'), data: null,
    sectorPe: [{ sector: 'Technology', pe: 25 }],
  }])
  await new MongooseCoreAliasStore().replace({
    aliases: [{
      aliasTicker: 'APPLE.TEST', canonicalTicker: 'AAPL', instrumentId: 'US0378331005',
      provenance: 'fmp-exchange-variants', observedAt: '2026-09-01T18:00:00.000Z',
    }],
    processed: [{ ticker: 'AAPL', processedAt: '2026-09-01T18:00:00.000Z' }],
  }, 0)
})

describe('Clareza core production mount offline dry-run', () => {
  const app = appForCentralError({ kind: 'router', mountPath: '/api/clareza', router: clarezaRouter })

  it('serves Radar, Carteira and bounded histories from one published Mongo generation', async () => {
    const [radar, carteira, analysis, search, raiox, raioxSearch] = await Promise.all([
      request(app).get('/api/clareza/radar?__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/carteira/data?__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/carteira/analysis?symbols=AAPL&__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/carteira/search?q=APPLE.TEST&__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/raiox?symbol=AAPL&__bo2_offline_loopback=1').expect(200),
      request(app).get('/api/clareza/raiox?search=app&__bo2_offline_loopback=1').expect(200),
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
    expect(search.body).toMatchObject({
      query: 'APPLE.TEST', count: 1,
      results: [{ ticker: 'AAPL', currency: null, via_alias: 'APPLE.TEST' }],
    })
    expect(raiox.body).toMatchObject({
      generationId: 'dry-run-generation', ticker: 'AAPL', p: { companyName: 'Apple', price: 200 },
      evaluation: { valuation: { score: 77 }, quality: { score: 77 } },
      companion_updated: '2026-09-01T18:10:00.000Z',
      sectorPe: [{ sector: 'Technology', pe: 25 }],
    })
    expect(raioxSearch.body).toMatchObject({
      query: 'APP', count: 1, results: [{ symbol: 'AAPL', name: 'Apple' }],
    })
  })
})
