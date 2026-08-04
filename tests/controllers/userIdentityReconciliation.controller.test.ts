import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { mergeDiscordId } from '../../src/controllers/userIdentityReconciliation.controller'
import User from '../../src/models/user'
import { createErrorHandling } from '../../src/security/errorHandling'
import { userIdentityMergeInput } from '../../src/security/userIdentityInput'
import { withValidatedInput } from '../../src/security/validatedInput'

installTestRuntimeConfigHooks()

let mongoServer: MongoMemoryServer

const app = express()
const errors = createErrorHandling({
  generateCorrelationId: () => 'identity-controller-test',
  logError: () => undefined,
})
app.use(errors.correlationId)
app.use(express.json())
app.post(
  '/merge',
  withValidatedInput(userIdentityMergeInput, mergeDiscordId),
)
app.use(errors.handler)

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'user_identity_controller_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(
      mongoServer.getUri('user_identity_controller_test'),
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

test('merge preserves the legacy response envelope and canonical Discord field', async () => {
  await User.collection.insertOne({
    email: 'student@example.test',
    name: 'Student',
    discord: { discordIds: [] },
  })

  const response = await request(app)
    .post('/merge?__bo2_offline_loopback=1')
    .send({
      email: 'student@example.test',
      newDiscordId: '123456789012345678',
    })
    .expect(200)

  expect(response.body).toEqual({
    message: 'Merge concluído com sucesso.',
    user: {
      email: 'student@example.test',
      discordIds: ['123456789012345678'],
    },
  })
  await expect(
    User.exists({
      email: 'student@example.test',
      'discord.discordIds': '123456789012345678',
    }),
  ).resolves.not.toBeNull()
})
