import { installTestRuntimeConfigHooks } from '../../support/runtimeConfig'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import universalSyncService, { clearProductsCache } from '../../../src/services/syncUtilizadoresServices/universalSyncService'
import type { UniversalSourceItem } from '../../../src/types/universalSync.types'
import { Product, User, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import SyncHistory from '../../../src/models/SyncModels/SyncHistory'

installTestRuntimeConfigHooks()

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  process.env.MONGOMS_RUNTIME_DOWNLOAD = 'false'
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'universal_sync_discord_test' },
  })
  await mongoose.connect(assertSafeTestMongoUri(mongoServer.getUri('universal_sync_discord_test')))
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  jest.restoreAllMocks()
  clearProductsCache()
  await Promise.all([
    Product.collection.deleteMany({}),
    User.collection.deleteMany({}),
    UserProduct.collection.deleteMany({}),
    Class.collection.deleteMany({}),
    SyncHistory.collection.deleteMany({}),
  ])
  await Product.collection.insertOne({
    code: 'DISCORD_COMMUNITY', platform: 'discord', name: 'Community', courseId: 'course-discord', isActive: true,
  })
})

const oid = (n: number) => new mongoose.Types.ObjectId(n.toString(16).padStart(24, '0'))

type LooseUser = { discord?: Record<string, unknown>; hotmart?: Record<string, unknown> } | null
const findLoose = async (email: string): Promise<LooseUser> =>
  (await User.findOne({ email }).lean()) as unknown as LooseUser
const findLooseById = async (id: mongoose.Types.ObjectId): Promise<LooseUser> =>
  (await User.findById(id).lean()) as unknown as LooseUser

function runDiscord(sourceData: UniversalSourceItem | UniversalSourceItem[]) {
  return universalSyncService.executeUniversalSync({
    syncType: 'discord',
    jobName: 'char-discord',
    triggeredBy: 'MANUAL',
    fullSync: true,
    includeProgress: false,
    includeTags: false,
    batchSize: 10,
    sourceData,
  })
}

const baseItem = (over: Partial<UniversalSourceItem> = {}): UniversalSourceItem => ({
  email: 'd@x.test',
  name: 'Duarte',
  discordUserId: '111222333',
  username: 'duarte#1',
  roles: ['member', 'renov'],
  ...over,
})

describe('universalSync discord — field mapping', () => {
  it('persists discordIds from discordUserId', async () => {
    await runDiscord(baseItem())
    const user = await findLoose('d@x.test')
    expect(user?.discord?.discordIds).toEqual(['111222333'])
  })

  it('DEBT: username and roles are written by the branch but dropped by the strict schema', async () => {
    // The discord branch sets discord.username and discord.roles, but neither
    // path exists on the User.discord schema, so Mongoose strict mode silently
    // drops them — only discordIds lands. Pinned as known debt; fixing the
    // schema/mapping is a separate commit, not this characterization.
    await runDiscord(baseItem())
    const user = await findLoose('d@x.test')
    expect(user?.discord?.username).toBeUndefined()
    expect(user?.discord?.roles).toBeUndefined()
  })

  it('handles partial data (only discordUserId)', async () => {
    await runDiscord(baseItem({ username: undefined, roles: undefined }))
    const user = await findLoose('d@x.test')
    expect(user?.discord?.discordIds).toEqual(['111222333'])
  })
})

describe('universalSync discord — cross-platform preservation', () => {
  it('does not wipe existing hotmart data on a discord sync', async () => {
    await User.collection.insertOne({
      _id: oid(1),
      email: 'd@x.test',
      name: 'Duarte',
      hotmart: { hotmartUserId: 'h-existing', purchaseDate: new Date('2026-02-02T00:00:00.000Z') },
    })

    await runDiscord(baseItem())

    const user = await findLooseById(oid(1))
    expect(user?.hotmart?.hotmartUserId).toBe('h-existing') // preserved
    expect(user?.discord?.discordIds).toEqual(['111222333']) // added
  })
})
