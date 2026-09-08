import mongoose from 'mongoose'

import User from '../../../src/models/user'
import { Product, UserProduct } from '../../../src/models'
import { Class } from '../../../src/models/Class'
import UserSnapshot from '../../../src/models/UserSnapshot'
import {
  assertHotmartUserMatchesPlan,
  mergeHotmartClassPlan,
  prepareHotmartSync,
} from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartSafety'
import { ensureClassExists } from '../../../src/services/syncUtilizadoresServices/universalSync/processSyncItem'

const collectionRows = (rows: unknown[]) => ({
  sort: () => ({
    limit: () => ({ toArray: async () => rows }),
  }),
})

const mockCollection = (model: { collection: { find: (...args: never[]) => unknown } }, rows: unknown[]) => {
  jest.spyOn(model.collection, 'find').mockReturnValue(collectionRows(rows) as never)
}

const sourceFor = (size: number) => Array.from({ length: size }, (_, index) => ({
  email: `u-${index}@example.test`,
  name: `User ${index}`,
  hotmartUserId: `h-${index}`,
}))

afterEach(() => {
  jest.restoreAllMocks()
})

test('preserves native BSON ids in scoped UserProduct and snapshot reads', async () => {
  const userId = new mongoose.Types.ObjectId()
  const productId = new mongoose.Types.ObjectId()
  const userProductId = new mongoose.Types.ObjectId()
  const snapshotId = new mongoose.Types.ObjectId()

  mockCollection(User, [{ _id: userId, email: 'native@example.test', name: 'Native' }])
  mockCollection(Product, [{ _id: productId, code: 'OGI_V1', platform: 'hotmart', name: 'OGI' }])
  mockCollection(Class, [])
  const userProductFind = jest.spyOn(UserProduct.collection, 'find')
    .mockReturnValue(collectionRows([{
      _id: userProductId,
      userId,
      productId,
      platform: 'hotmart',
      status: 'ACTIVE',
      classes: [],
      updatedAt: new Date('2026-09-08T08:00:00.000Z'),
    }]) as never)
  const snapshotFind = jest.spyOn(UserSnapshot.collection, 'find')
    .mockReturnValue(collectionRows([{
      _id: snapshotId,
      userId,
      syncType: 'hotmart',
      snapshotDate: new Date('2026-09-08T08:00:00.000Z'),
      products: [],
    }]) as never)

  const result = await prepareHotmartSync({
    email: 'native@example.test',
    name: 'Native',
    hotmartUserId: 'h-native',
  }, true)

  expect(result.executionPlan.userProducts).toHaveLength(1)
  expect(result.executionPlan.snapshots).toHaveLength(1)
  expect(userProductFind.mock.calls[0][0]).toEqual({ userId: { $in: [userId] } })
  expect(snapshotFind.mock.calls[0][0]).toEqual({ userId: { $in: [userId] }, syncType: 'hotmart' })
})

test('refreshes the execution class plan after an existing class update for repeated source items', async () => {
  const classId = new mongoose.Types.ObjectId()
  const firstUpdatedAt = new Date('2026-09-08T08:00:00.000Z')
  const secondUpdatedAt = new Date('2026-09-08T08:01:00.000Z')
  const executionPlan = { classes: [] as Record<string, unknown>[] }
  const first = { _id: classId, classId: 'class-a', name: 'Turma A', updatedAt: firstUpdatedAt }
  const second = { ...first, updatedAt: secondUpdatedAt }

  jest.spyOn(Class, 'findOneAndUpdate').mockResolvedValue(second as never)

  await ensureClassExists(
    'class-a',
    'Turma A',
    'hotmart',
    undefined,
    undefined,
    undefined,
    first as never,
    true,
    row => mergeHotmartClassPlan(executionPlan, row),
  )

  expect(executionPlan.classes).toHaveLength(1)
  expect(executionPlan.classes[0].updatedAt).toBe(secondUpdatedAt)
  expect((Class.findOneAndUpdate as jest.Mock).mock.calls[0][0]).toMatchObject({
    _id: classId,
    classId: 'class-a',
    updatedAt: firstUpdatedAt,
  })
})

test('merges a newly created class into the plan before a repeated source item', async () => {
  const classId = new mongoose.Types.ObjectId()
  const firstUpdatedAt = new Date('2026-09-08T08:00:00.000Z')
  const secondUpdatedAt = new Date('2026-09-08T08:01:00.000Z')
  const executionPlan = { classes: [] as Record<string, unknown>[] }
  const created = { _id: classId, classId: 'class-new', name: 'Nova', updatedAt: firstUpdatedAt }
  const updated = { ...created, updatedAt: secondUpdatedAt }

  jest.spyOn(Class, 'create').mockResolvedValue(created as never)
  jest.spyOn(Class, 'findOneAndUpdate').mockResolvedValue(updated as never)

  const merge = (row: Record<string, unknown>) => mergeHotmartClassPlan(executionPlan, row)
  await ensureClassExists('class-new', 'Nova', 'hotmart', undefined, undefined, undefined, undefined, true, merge)
  expect(executionPlan.classes).toHaveLength(1)

  await ensureClassExists(
    'class-new',
    'Nova',
    'hotmart',
    undefined,
    undefined,
    undefined,
    executionPlan.classes[0] as never,
    true,
    merge,
  )

  expect(executionPlan.classes).toHaveLength(1)
  expect(executionPlan.classes[0].updatedAt).toBe(secondUpdatedAt)
})

test('rejects a sub-20k source when bounded product/class history makes effects exceed the cap', async () => {
  const size = 300
  const users = sourceFor(size).map((item, index) => ({
    ...item,
    _id: new mongoose.Types.ObjectId(),
  }))
  const productId = new mongoose.Types.ObjectId()
  const userProducts = users.flatMap(user => Array.from({ length: 20 }, (_, index) => ({
    _id: new mongoose.Types.ObjectId(),
    userId: user._id,
    productId,
    platform: 'hotmart',
    status: 'ACTIVE',
    progress: { percentage: index, completed: index },
    engagement: { engagementScore: index, totalLogins: index },
    classes: Array.from({ length: 2 }, (_, classIndex) => ({ classId: `c-${classIndex}`, className: `Class ${classIndex}`, role: 'student' })),
    updatedAt: new Date('2026-09-08T08:00:00.000Z'),
  })))
  const snapshots = users.map(user => ({
    _id: new mongoose.Types.ObjectId(),
    userId: user._id,
    syncType: 'hotmart',
    snapshotDate: new Date('2026-09-08T08:00:00.000Z'),
    userState: { email: user.email, name: user.name },
    products: Array.from({ length: 20 }, (_, index) => ({
      productId: productId.toString(),
      productName: `Product ${index}`,
      platform: 'hotmart',
      status: 'ACTIVE',
      classes: Array.from({ length: 2 }, (_, classIndex) => ({ classId: `old-${index}-${classIndex}`, className: 'Old', role: 'student' })),
    })),
  }))

  mockCollection(User, users)
  mockCollection(Product, [{ _id: productId, code: 'OGI_V1', platform: 'hotmart', name: 'OGI' }])
  mockCollection(Class, [])
  mockCollection(UserProduct, userProducts)
  mockCollection(UserSnapshot, snapshots)

  await expect(prepareHotmartSync(sourceFor(size), true))
    .rejects.toThrow('HOTMART_SYNC_EFFECTIVE_MUTATION_LIMIT_EXCEEDED')
})

test('keeps same-id class changes outside the planned optimistic predicate', async () => {
  const classId = new mongoose.Types.ObjectId()
  const plannedUpdatedAt = new Date('2026-09-08T08:00:00.000Z')
  const changedUpdatedAt = new Date('2026-09-08T08:01:00.000Z')
  const planned = { _id: classId, classId: 'class-concurrent', name: 'Turma', updatedAt: plannedUpdatedAt }

  jest.spyOn(Class, 'findOneAndUpdate').mockResolvedValue({ ...planned, updatedAt: changedUpdatedAt } as never)
  await ensureClassExists('class-concurrent', 'Turma', 'hotmart', undefined, undefined, undefined, planned as never, true)

  const predicate = (Class.findOneAndUpdate as jest.Mock).mock.calls[0][0]
  expect(predicate).toMatchObject({ _id: classId, classId: 'class-concurrent', updatedAt: plannedUpdatedAt })
  expect({ ...planned, updatedAt: changedUpdatedAt }).not.toMatchObject(predicate)
})

test('retains the existing same-id user concurrency guard', () => {
  const planned = {
    _id: 'user-1',
    email: 'student@example.test',
    name: 'Before',
    classId: 'class-a',
    combined: { status: 'ACTIVE' },
  }

  expect(() => assertHotmartUserMatchesPlan(planned, { ...planned, name: 'Changed concurrently' }))
    .toThrow('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
})
