import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import ClarezaCoreAliasState from '../../../src/models/ClarezaCoreAliasState'
import {
  CoreAliasRevisionConflictError,
  MongooseCoreAliasStore,
} from '../../../src/services/clareza/core/coreAliasStore'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' }, instance: { dbName: 'clareza_alias_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('clareza_alias_test')))
  // The model may have been compiled against another integration-test database.
  // Recreate its unique CAS index on this isolated database before exercising stale writers.
  await ClarezaCoreAliasState.syncIndexes()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => ClarezaCoreAliasState.collection.deleteMany({}))

describe('MongooseCoreAliasStore', () => {
  it('persists alias provenance and processed markers across instances', async () => {
    const store = new MongooseCoreAliasStore()
    await expect(store.read()).resolves.toEqual({ revision: 0, state: { aliases: [], processed: [] } })

    await expect(store.replace({
      aliases: [{
        aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L', instrumentId: 'IE00B5BMR087',
        provenance: 'fmp-exchange-variants', observedAt: '2026-09-01T00:00:00.000Z',
      }],
      processed: [{ ticker: 'CSP1.L', processedAt: '2026-09-01T00:00:00.000Z' }],
    }, 0)).resolves.toBe(1)

    await expect(new MongooseCoreAliasStore().read()).resolves.toMatchObject({
      revision: 1,
      state: { aliases: [{ aliasTicker: 'CSPX.AS', canonicalTicker: 'CSP1.L' }] },
    })
  })

  it('rejects a stale writer instead of losing an alias update', async () => {
    const store = new MongooseCoreAliasStore()
    await store.replace({ aliases: [], processed: [] }, 0)
    await expect(store.replace({ aliases: [], processed: [] }, 0))
      .rejects.toBeInstanceOf(CoreAliasRevisionConflictError)
  })
})
