import {
  type Collection,
  type Db,
  type Document,
  MongoClient,
} from 'mongodb'
import { MongoMemoryServer } from 'mongodb-memory-server'
import {
  MongoUsersV2IndexCatalog,
  ensureUsersV2Index,
  readUsersV2IndexCliConfig,
  runUsersV2IndexMaintenance,
  type UsersV2IndexCatalog,
  type UsersV2IndexConnection,
} from '../../../src/scripts/maintenance/ensure-users-v2-indexes'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'

const expectedIndexName = 'users_v2_platform_status'
const collectionName = 'userproducts'

let mongoServer: MongoMemoryServer
let client: MongoClient
let database: Db
let collection: Collection<Document>

beforeAll(async () => {
  expect(process.env.MONGOMS_RUNTIME_DOWNLOAD).toBe('false')
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'users_v2_index_maintenance_test' },
  })
  const uri = assertSafeTestMongoUri(
    mongoServer.getUri('users_v2_index_maintenance_test'),
  )
  client = new MongoClient(uri)
  await client.connect()
  database = client.db()
})

afterAll(async () => {
  await client.close()
  await mongoServer.stop()
})

beforeEach(async () => {
  const existing = await database
    .listCollections({ name: collectionName })
    .toArray()
  if (existing.length > 0) {
    await database.collection(collectionName).drop()
  }
  await database.createCollection(collectionName)
  collection = database.collection(collectionName)
  jest.restoreAllMocks()
})

const catalog = (): MongoUsersV2IndexCatalog =>
  new MongoUsersV2IndexCatalog(collection)

describe('Users V2 index maintenance', () => {
  it('inspects by default without creating the missing index', async () => {
    const createIndex = jest.spyOn(collection, 'createIndex')

    await expect(ensureUsersV2Index(catalog(), { apply: false }))
      .resolves.toEqual({
        status: 'missing',
        indexName: expectedIndexName,
        mutated: false,
      })
    expect(createIndex).not.toHaveBeenCalled()
  })

  it('reports an absent collection as missing without creating it', async () => {
    await collection.drop()

    await expect(ensureUsersV2Index(catalog(), { apply: false }))
      .resolves.toEqual({
        status: 'missing',
        indexName: expectedIndexName,
        mutated: false,
      })
    await expect(database.listCollections({ name: collectionName }).toArray())
      .resolves.toHaveLength(0)
  })

  it('creates and verifies the index when the collection is absent', async () => {
    await collection.drop()

    await expect(ensureUsersV2Index(catalog(), { apply: true }))
      .resolves.toEqual({
        status: 'created',
        indexName: expectedIndexName,
        mutated: true,
      })
    const indexes = await collection.listIndexes().toArray()
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: expectedIndexName,
        key: { platform: 1, status: 1 },
      }),
    ]))
  })

  it('creates and verifies the exact index only when apply is true', async () => {
    await expect(ensureUsersV2Index(catalog(), { apply: true }))
      .resolves.toEqual({
        status: 'created',
        indexName: expectedIndexName,
        mutated: true,
      })

    const indexes = await collection.listIndexes().toArray()
    expect(indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: expectedIndexName,
        key: { platform: 1, status: 1 },
      }),
    ]))
  })

  it('is an idempotent verified no-op on a second apply', async () => {
    await ensureUsersV2Index(catalog(), { apply: true })
    const createIndex = jest.spyOn(collection, 'createIndex')

    await expect(ensureUsersV2Index(catalog(), { apply: true }))
      .resolves.toEqual({
        status: 'verified',
        indexName: expectedIndexName,
        mutated: false,
      })
    expect(createIndex).not.toHaveBeenCalled()
  })

  it('fails closed when the expected name has the wrong key', async () => {
    await collection.createIndex(
      { status: 1, platform: 1 },
      { name: expectedIndexName },
    )

    await expect(ensureUsersV2Index(catalog(), { apply: true }))
      .rejects.toThrow(
        'users_v2_platform_status exists with an unexpected key or options',
      )
  })

  it('fails closed when the expected name has unsafe options', async () => {
    await collection.createIndex(
      { platform: 1, status: 1 },
      { name: expectedIndexName, unique: true },
    )

    await expect(ensureUsersV2Index(catalog(), { apply: true }))
      .rejects.toThrow(
        'users_v2_platform_status exists with an unexpected key or options',
      )
  })

  it('fails closed on an equivalent key under another name', async () => {
    await collection.createIndex(
      { platform: 1, status: 1 },
      { name: 'legacy_platform_status' },
    )

    await expect(ensureUsersV2Index(catalog(), { apply: true }))
      .rejects.toThrow(
        'Equivalent Users V2 index legacy_platform_status exists',
      )
  })

  it('requires MONGO_URI and accepts only an explicit boolean apply flag', () => {
    expect(() => readUsersV2IndexCliConfig({})).toThrow(
      'MONGO_URI is required for Users V2 index maintenance',
    )
    expect(() => readUsersV2IndexCliConfig({
      MONGO_URI: 'mongodb://127.0.0.1:27017/test',
      USERS_V2_INDEX_APPLY: 'yes',
    })).toThrow('USERS_V2_INDEX_APPLY must be true or false')
    expect(readUsersV2IndexCliConfig({
      MONGO_URI: 'mongodb://127.0.0.1:27017/test',
    })).toEqual({
      mongoUri: 'mongodb://127.0.0.1:27017/test',
      apply: false,
    })
    expect(readUsersV2IndexCliConfig({
      MONGO_URI: 'mongodb://127.0.0.1:27017/test',
      USERS_V2_INDEX_APPLY: 'true',
    })).toEqual({
      mongoUri: 'mongodb://127.0.0.1:27017/test',
      apply: true,
    })
  })

  it('always closes the injected connection after a failure', async () => {
    let closed = false
    const failingCatalog: UsersV2IndexCatalog = {
      list: async () => {
        throw new Error('inspection failed')
      },
      createExpected: async () => undefined,
    }
    const connection: UsersV2IndexConnection = {
      openCatalog: async () => failingCatalog,
      close: async () => {
        closed = true
      },
    }

    await expect(runUsersV2IndexMaintenance(connection, { apply: false }))
      .rejects.toThrow('inspection failed')
    expect(closed).toBe(true)
  })

  it('rethrows an unrelated catalog list failure without creating', async () => {
    const createExpected = jest.fn(async () => undefined)
    const failingCatalog: UsersV2IndexCatalog = {
      list: async () => {
        throw new Error('authorization failed')
      },
      createExpected,
    }

    await expect(ensureUsersV2Index(failingCatalog, { apply: true }))
      .rejects.toThrow('authorization failed')
    expect(createExpected).not.toHaveBeenCalled()
  })

  it('has no connection side effect when the CLI module is imported', () => {
    const connect = jest.spyOn(MongoClient.prototype, 'connect')

    jest.isolateModules(() => {
      require('../../../src/scripts/maintenance/ensure-users-v2-indexes')
    })

    expect(connect).not.toHaveBeenCalled()
  })
})
