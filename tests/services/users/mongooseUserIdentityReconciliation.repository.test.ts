import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import User from '../../../src/models/user'
import { MongooseUserIdentityReconciliationRepository } from '../../../src/services/users/mongooseUserIdentityReconciliation.repository'

let mongoServer: MongoMemoryServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_identity_reconciliation_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(
      mongoServer.getUri('user_identity_reconciliation_test'),
    ),
  )
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await User.collection.deleteMany({})
})

test('email lookup treats regex metacharacters as literal characters', async () => {
  await User.collection.insertMany([
    {
      email: 'aaab@exampleXtest',
      name: 'Wrong regex match',
      discord: { discordIds: ['wrong-id'] },
    },
    {
      email: 'a+b@example.test',
      name: 'Exact match',
      discord: { discordIds: ['exact-id'] },
    },
  ])
  const repository = new MongooseUserIdentityReconciliationRepository()

  const user = await repository.findUserByEmail('A+B@example.test')

  expect(user).toMatchObject({
    email: 'a+b@example.test',
    name: 'Exact match',
    discordIds: ['exact-id'],
  })
})
