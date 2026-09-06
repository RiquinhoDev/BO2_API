import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const findUser = jest.fn()
const findState = jest.fn()
const findOneState = jest.fn()
const createChange = jest.fn()
const updateChange = jest.fn()
const updateOneChange = jest.fn()
const deleteOneState = jest.fn()
const updateOneState = jest.fn()
const findOneChange = jest.fn()
const findChange = jest.fn()
const limitCalls: number[] = []

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: (...args: unknown[]) => findUser(...args) },
}))
jest.mock('../../src/models/discordRenewal', () => ({
  __esModule: true,
  DiscordRoleChange: {
    find: (...args: unknown[]) => findChange(...args),
    create: (...args: unknown[]) => createChange(...args),
    updateMany: (...args: unknown[]) => updateChange(...args),
    updateOne: (...args: unknown[]) => updateOneChange(...args),
    findOne: (...args: unknown[]) => findOneChange(...args),
  },
  DiscordRoleState: {
    find: (...args: unknown[]) => findState(...args),
    findOne: (...args: unknown[]) => findOneState(...args),
    updateOne: (...args: unknown[]) => updateOneState(...args),
    deleteOne: (...args: unknown[]) => deleteOneState(...args),
  },
  DiscordMessageTemplate: {},
}))

const chain = (value: unknown) => ({
  select: () => chain(value),
  sort: () => chain(value),
  limit: (limit: number) => {
    limitCalls.push(limit)
    return chain(Array.isArray(value) ? value.slice(0, limit) : value)
  },
  lean: () => chain(value),
  exec: async () => value,
})

function install(overrides: Record<string, unknown> = {}, discord = false) {
  const base = createTestRuntimeConfig()
  initializeRuntimeConfig({
    ...base,
    integrations: discord
      ? {
        ...base.integrations,
        discord: {
          configured: true,
          value: { botUrl: 'https://discord.test', sharedSecret: 'secret', messageChannels: [] },
        },
      }
      : base.integrations,
    renewal: { ...base.renewal, ...overrides },
  })
}

beforeEach(() => {
  jest.restoreAllMocks()
  jest.resetAllMocks()
  limitCalls.length = 0
  resetRuntimeConfigForTests()
  install()
  findUser.mockReturnValue(chain([]))
  findState.mockReturnValue(chain([]))
  findOneState.mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => ({ email: 'state@example.test' }) }) }),
  })
  findChange.mockReturnValue(chain([]))
  findOneChange.mockReturnValue({ select: () => ({ lean: () => ({ exec: async () => null }) }) })
  createChange.mockResolvedValue({})
  updateChange.mockResolvedValue({ modifiedCount: 0 })
  updateOneChange.mockResolvedValue({ modifiedCount: 1 })
  updateOneState.mockResolvedValue({ modifiedCount: 1 })
  deleteOneState.mockResolvedValue({ deletedCount: 1 })
})

afterEach(() => resetRuntimeConfigForTests())

const change = (index: number, discordUserId = `discord-${index}`, addRoleId = 'role-1') => ({
  _id: `change-${index}`,
  discordUserId,
  sourceRef: discordUserId,
  status: 'APPROVED',
  plannedAt: new Date(),
  payload: { addRoleId, removeRoleIds: [] },
})

test('DiscordRoles prepared conflict has zero local effects before expiry', async () => {
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')

  await expect(executeDiscordRolesPlan({
    executedBy: 'test',
    preparedChanges: [
      { _id: 'change-1', discordUserId: 'discord-1', payload: { addRoleId: 'role-1', removeRoleIds: [] } },
      { _id: 'change-2', discordUserId: 'discord-1', payload: { addRoleId: 'role-2', removeRoleIds: [] } },
    ],
  } as never)).rejects.toMatchObject({ status: 409, code: 'DISCORD_ROLES_DUPLICATE_CONFLICT' })
  expect(updateChange).not.toHaveBeenCalled()
  expect(updateOneChange).not.toHaveBeenCalled()
})

test('DiscordRoles direct bounded read caps equivalent docs by effective account operations', async () => {
  const axios = await import('axios')
  const operations: string[] = []
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    operations.push(...payload.operations.map(({ discordUserId }) => discordUserId))
    return { data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) } } as never
  })
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  findChange.mockReturnValue(chain(Array.from({ length: 101 }, (_, index) => ({
    _id: `change-${index}`,
    discordUserId: `discord-${index % 60}`,
    status: 'APPROVED',
    plannedAt: new Date(),
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }))))

  const result = await executeDiscordRolesPlan({ executedBy: 'test', strictCap: true, skipExpiry: true } as never)

  expect(result).toMatchObject({ attempted: 60, leftForNextRun: 0 })
  expect(operations).toHaveLength(60)
})

test('DiscordRoles generic conflicting live records fail before expiry or create', async () => {
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  findUser.mockReturnValue(chain([{
    _id: 'user-1',
    email: 'user@example.test',
    discord: { discordIds: ['discord-1'] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }]))
  findState.mockReturnValue(chain([]))
  const conflicts = [
    { _id: 'change-1', discordUserId: 'discord-1', sourceRef: 'discord-1', status: 'APPROVED', plannedAt: new Date(), payload: { addRoleId: 'role-1', removeRoleIds: [] } },
    { _id: 'change-2', discordUserId: 'discord-1', sourceRef: 'discord-1', status: 'APPROVED', plannedAt: new Date(), payload: { addRoleId: 'role-2', removeRoleIds: [] } },
  ]
  findChange.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(conflicts))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true, discordRolesAutoExecute: true }, true)

  await expect(runDiscordRolesSyncJob({ triggeredBy: 'CRON' })).rejects.toMatchObject({
    status: 409,
    code: 'DISCORD_ROLES_DUPLICATE_CONFLICT',
  })
  expect(updateChange).not.toHaveBeenCalled()
  expect(createChange).not.toHaveBeenCalled()
})

test('DiscordRoles scheduled backlog propagates bounded snapshot remainder', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    return { data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) } } as never
  })
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  findUser.mockReturnValue(chain([]))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValue(chain(Array.from({ length: 101 }, (_, index) => ({
    _id: `change-${index}`,
    discordUserId: `discord-${index}`,
    sourceRef: `discord-${index}`,
    status: 'APPROVED',
    plannedAt: new Date(),
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }))))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true, discordRolesAutoExecute: true }, true)

  const result = await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })

  expect(result.execution).toMatchObject({ attempted: 100, leftForNextRun: 1 })
})

test('DiscordRoles settles every equivalent document under one provider operation', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    return { data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) } } as never
  })
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  const preparedChanges = [
    ...Array.from({ length: 100 }, (_, index) => ({
      _id: `existing-${index}`,
      discordUserId: `discord-${index % 60}`,
      payload: { addRoleId: 'role-1', removeRoleIds: [] },
    })),
    ...Array.from({ length: 39 }, (_, index) => ({
      _id: `new-${index}`,
      discordUserId: `new-${index}`,
      payload: { addRoleId: 'role-1', removeRoleIds: [] },
    })),
  ]

  const result = await executeDiscordRolesPlan({ executedBy: 'test', preparedChanges, skipExpiry: true } as never)

  expect(result.attempted).toBe(99)
  expect(updateChange).toHaveBeenCalledTimes(99)
  expect(updateChange.mock.calls.some(([filter]) => Array.isArray(filter?._id?.$in) && filter._id.$in.length > 1)).toBe(true)
})

test('DiscordRoles direct reads the hidden 102nd conflicting document before effects', async () => {
  const axios = await import('axios')
  const post = jest.spyOn(axios.default, 'post')
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  findChange.mockReturnValue(chain([
    ...Array.from({ length: 101 }, (_, index) => change(index, 'discord-1', 'role-1')),
    change(101, 'discord-1', 'role-2'),
  ]))

  await expect(executeDiscordRolesPlan({ executedBy: 'test', strictCap: true } as never))
    .rejects.toMatchObject({ status: 409, code: 'DISCORD_ROLES_DUPLICATE_CONFLICT' })
  expect(post).not.toHaveBeenCalled()
  expect(updateChange).not.toHaveBeenCalled()
})

test('DiscordRoles generic reads and settles the hidden 102nd equivalent document', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    return { data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) } } as never
  })
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true, discordRolesAutoExecute: true }, true)
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  findUser.mockReturnValue(chain([]))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValue(chain(Array.from({ length: 102 }, (_, index) => change(index, 'discord-1'))))

  const result = await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })

  expect(result.execution).toMatchObject({ attempted: 1, leftForNextRun: 0 })
  expect(limitCalls).toContain(20_001)
  expect(updateChange.mock.calls.some(([filter]) => filter?._id?.$in?.length === 102)).toBe(true)
})

test('DiscordRoles direct physical read overflow fails closed before expiry', async () => {
  const axios = await import('axios')
  const post = jest.spyOn(axios.default, 'post')
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  findChange.mockReturnValue(chain(Array.from({ length: 20_001 }, (_, index) => change(index))))

  await expect(executeDiscordRolesPlan({ executedBy: 'test' } as never)).rejects.toMatchObject({ status: 413 })
  expect(post).not.toHaveBeenCalled()
  expect(updateChange).not.toHaveBeenCalled()
})

test('DiscordRoles generic physical read overflow fails closed before expiry or create', async () => {
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  findUser.mockReturnValue(chain([]))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValue(chain(Array.from({ length: 20_001 }, (_, index) => change(index))))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)

  await expect(runDiscordRolesSyncJob({ triggeredBy: 'CRON' })).rejects.toMatchObject({ status: 413 })
  expect(updateChange).not.toHaveBeenCalled()
  expect(createChange).not.toHaveBeenCalled()
})

test('DiscordRoles does not mix executable Maio with historical Abril suppression', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    return { data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) } } as never
  })
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  findUser.mockReturnValue(chain([]))
  findState.mockReturnValue(chain([]))
  const mixed = [
    change(1, 'discord-1', '1525119933300740156'),
    { ...change(2, 'discord-1', 'role-abril'), status: 'BLOCKED', notInGuild: true },
  ]
  findChange.mockReturnValue(chain(mixed))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true, discordRolesAutoExecute: true }, true)

  const result = await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })

  expect(result.execution).toMatchObject({ attempted: 1, applied: 1 })
})

test('DiscordRoles unions excluded existing and executor backlog identities', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    return { data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) } } as never
  })
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  const students = Array.from({ length: 39 }, (_, index) => ({
    _id: `user-${index}`,
    email: `user-${index}@example.test`,
    discord: { discordIds: [`new-${index}`] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }))
  findUser.mockReturnValue(chain(students))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(Array.from({ length: 101 }, (_, index) => change(index))))
  createChange.mockImplementation(async (value: Record<string, unknown>) => ({ ...value, _id: `created-${String(value.discordUserId)}` }))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true, discordRolesAutoExecute: true }, true)

  const result = await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })

  expect(result.execution).toMatchObject({ attempted: 100, leftForNextRun: 40 })
})
