import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

import { assertSafeTestMongoUri } from '../../../src/config/testDatabase'
import {
  DiscordMessageLog,
  DiscordMessageTemplate,
  DiscordRoleState,
  DiscordScheduledRule,
} from '../../../src/models/discordRenewal'
import DiscordMessageExecutionReceipt from '../../../src/models/DiscordMessageExecutionReceipt'
import CompositeExecutionReceipt from '../../../src/models/CompositeExecutionReceipt'
import { sendDiscordMessage } from '../../../src/services/renewal/discord/execution'
import { runCompositeExecutionWithReceipt } from '../../../src/services/cron/compositeExecution.service'
import {
  runScheduledMessagesJob,
  testScheduledRule,
} from '../../../src/services/renewal/discordScheduledMessages.service'
import { discordMessageIdentity } from '../../../src/services/renewal/discord/discordMessageTransport.service'

jest.mock('axios', () => ({
  post: jest.fn(),
  isAxiosError: jest.fn(() => false),
}))

jest.mock('../../../src/config/runtimeConfig', () => ({
  getRuntimeConfig: jest.fn(),
}))

import axios from 'axios'
import { getRuntimeConfig } from '../../../src/config/runtimeConfig'

const mockAxiosPost = axios.post as jest.Mock
const mockGetRuntimeConfig = getRuntimeConfig as jest.MockedFunction<typeof getRuntimeConfig>
const mockRuntimeConfig = {
  renewal: {
    discordMessagesEnabled: true,
    discordScheduledMessagesEnabled: true,
    discordRolesSyncEnabled: false,
    discordRolesAutoExecute: false,
    discordRolesManualExecutionEnabled: false,
    discordRolesMaxOpsPerRun: 100,
    discordMessageChannelId: 'channel-1',
    discordMessageChannels: ['channel-1:Renewals'],
  },
  integrations: {
    discord: {
      configured: true,
      value: { botUrl: 'http://discord-bot', sharedSecret: 'secret' },
    },
  },
}

type Message = {
  content: string
  mentionRoleIds: string[]
  dataFim: string
  channelId?: string
  templateKey: string
  sentBy: string
}

type MessageResult = {
  success: boolean
  message: string
  messageIds?: string[]
  kind?: string
}

type MessageSender = (
  message: Message,
  requestId?: string,
  options?: { now?: () => Date },
) => Promise<MessageResult>

const sendWithRequestId = sendDiscordMessage as unknown as MessageSender

type ScheduledRun = (requestId?: string, options?: {
  now?: () => Date
  dryRun?: boolean
  phaseHooks?: { providerStarted(): void; providerSucceeded(): void; localMutationStarted(): void }
}) => Promise<{
  sent: number
  skipped: Array<{ rule: string; reason: string }>
}>

const runScheduled = runScheduledMessagesJob as unknown as ScheduledRun
const testScheduled = testScheduledRule as unknown as (
  key: string,
  sentBy: string,
  requestId?: string,
) => Promise<MessageResult>

let mongoServer: MongoMemoryServer

const message: Message = {
  content: 'Renova até {dataFim}',
  mentionRoleIds: [],
  dataFim: '31/07/2026',
  channelId: 'channel-1',
  templateKey: 'aviso-importante',
  sentBy: 'reviewer@example.test',
}

beforeAll(async () => {
  mockGetRuntimeConfig.mockReturnValue(mockRuntimeConfig as never)
  mongoServer = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'discord_message_receipt_test' },
  })
  await mongoose.connect(
    assertSafeTestMongoUri(mongoServer.getUri('discord_message_receipt_test')),
  )
  await Promise.all([
    DiscordMessageExecutionReceipt.init(),
    DiscordMessageLog.init(),
    DiscordMessageTemplate.init(),
    DiscordRoleState.init(),
    DiscordScheduledRule.init(),
  ])
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
})

beforeEach(async () => {
  await Promise.all([
    DiscordMessageLog.deleteMany({}),
    DiscordMessageExecutionReceipt.deleteMany({}),
    DiscordMessageTemplate.deleteMany({}),
    DiscordRoleState.deleteMany({}),
    DiscordScheduledRule.deleteMany({}),
  ])
  mockAxiosPost.mockReset()
  mockAxiosPost.mockResolvedValue({ data: { messageIds: ['message-1'], parts: 1 } })
  mockRuntimeConfig.renewal.discordMessagesEnabled = true
  mockRuntimeConfig.renewal.discordScheduledMessagesEnabled = true
  mockRuntimeConfig.renewal.discordMessageChannelId = 'channel-1'
  mockRuntimeConfig.renewal.discordMessageChannels = ['channel-1:Renewals']
})

test('scheduled HTTP run replays its canonical report before reseeding or provider I/O', async () => {
  const now = new Date('2026-08-08T09:00:00.000Z')

  const first = await runScheduled('scheduled-run-a', { now: () => now })
  const seededRules = await DiscordScheduledRule.countDocuments({})
  const replay = await runScheduled('scheduled-run-a', { now: () => now })

  expect(replay).toEqual(first)
  expect(seededRules).toBe(2)
  expect(await DiscordScheduledRule.countDocuments({})).toBe(seededRules)
  expect(await DiscordMessageExecutionReceipt.findOne({
    operation: 'scheduled-run',
    requestId: 'scheduled-run-a',
  }).lean()).toMatchObject({ status: 'completed', providerStatus: 'not-started' })
  expect(mockAxiosPost).not.toHaveBeenCalled()
})

test('scheduled dry-run does not create a receipt, seed defaults or save skip state', async () => {
  const now = new Date('2026-08-08T09:00:00.000Z')
  const rule = await DiscordScheduledRule.create({
    key: 'lembrete-dia-8',
    label: 'Lembrete',
    dayOfMonth: 8,
    templateKey: 'aviso-importante',
    enabled: true,
    createdBy: 'test',
  })
  await DiscordMessageTemplate.create({
    key: 'aviso-importante',
    name: 'Aviso',
    content: 'Renova até {dataFim}',
  })
  await DiscordRoleState.create({
    discordUserId: 'discord-dry-run',
    email: 'dry-run@example.test',
    roleId: '1525120024681910424',
    roleName: 'R. Julho',
    appliedAt: now,
  })

  const report = await runScheduled('dry-run-route-id', {
    now: () => now,
    dryRun: true,
  })

  expect(report).toMatchObject({ dryRun: true, planned: 1 })
  expect(await DiscordScheduledRule.countDocuments({})).toBe(1)
  expect(await DiscordScheduledRule.findById(rule._id).lean()).not.toHaveProperty('lastRunAt')
  expect(await DiscordMessageExecutionReceipt.countDocuments({})).toBe(0)
  expect(mockAxiosPost).not.toHaveBeenCalled()
})

test('scheduled run rejects more than the finite rule cap before provider I/O', async () => {
  await DiscordMessageTemplate.create({
    key: 'aviso-importante',
    name: 'Aviso',
    content: 'Renova até {dataFim}',
  })
  await DiscordScheduledRule.insertMany(Array.from({ length: 51 }, (_, index) => ({
    key: `rule-${index}`,
    label: `Regra ${index}`,
    dayOfMonth: 8,
    templateKey: 'aviso-importante',
    enabled: true,
    createdBy: 'test',
  })))

  await expect(runScheduled(undefined, {
    now: () => new Date('2026-08-08T09:00:00.000Z'),
  })).rejects.toMatchObject({
    status: 413,
    code: 'DISCORD_SCHEDULED_MESSAGES_LIMIT_EXCEEDED',
  })
  expect(mockAxiosPost).not.toHaveBeenCalled()
})

test('scheduled run rejects existing rules plus missing defaults before seed writes', async () => {
  await DiscordScheduledRule.insertMany(Array.from({ length: 49 }, (_, index) => ({
    key: `custom-rule-${index}`,
    label: `Regra custom ${index}`,
    dayOfMonth: 8,
    templateKey: 'aviso-importante',
    enabled: true,
    createdBy: 'test',
  })))

  await expect(runScheduled(undefined, {
    now: () => new Date('2026-08-08T09:00:00.000Z'),
  })).rejects.toMatchObject({
    status: 413,
    code: 'DISCORD_SCHEDULED_MESSAGES_LIMIT_EXCEEDED',
  })
  expect(await DiscordScheduledRule.countDocuments({})).toBe(49)
  expect(await DiscordScheduledRule.countDocuments({ key: 'lembrete-dia-8' })).toBe(0)
  expect(mockAxiosPost).not.toHaveBeenCalled()
})

test('scheduled test replay wins over deleted rule/template and config drift', async () => {
  await DiscordMessageTemplate.create({
    key: 'aviso-importante',
    name: 'Aviso',
    content: 'Renova até {dataFim}',
  })
  await DiscordScheduledRule.create({
    key: 'lembrete-dia-8',
    label: 'Lembrete',
    dayOfMonth: 8,
    templateKey: 'aviso-importante',
    enabled: true,
    createdBy: 'test',
  })

  const first = await testScheduled('lembrete-dia-8', 'reviewer@example.test', 'test-a')
  await DiscordScheduledRule.deleteMany({})
  await DiscordMessageTemplate.deleteMany({})
  mockRuntimeConfig.renewal.discordMessagesEnabled = false
  const replay = await testScheduled('lembrete-dia-8', 'reviewer@example.test', 'test-a')

  expect(replay).toEqual(first)
  expect(mockAxiosPost).toHaveBeenCalledTimes(1)
})

test('scheduled test rejects the same request ID for a different normalized actor', async () => {
  await DiscordMessageTemplate.create({
    key: 'aviso-importante',
    name: 'Aviso',
    content: 'Renova até {dataFim}',
  })
  await DiscordScheduledRule.create({
    key: 'lembrete-dia-8',
    label: 'Lembrete',
    dayOfMonth: 8,
    templateKey: 'aviso-importante',
    enabled: true,
    createdBy: 'test',
  })

  await testScheduled('lembrete-dia-8', ' Reviewer@Example.Test ', 'test-a')
  const reused = await testScheduled('lembrete-dia-8', 'other@example.test', 'test-a')

  expect(reused).toMatchObject({ success: false, kind: 'request-id-reused' })
  expect(mockAxiosPost).toHaveBeenCalledTimes(1)
})
