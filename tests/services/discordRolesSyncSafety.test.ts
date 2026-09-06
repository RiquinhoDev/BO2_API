import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const findUser = jest.fn()
const findState = jest.fn()
const findOneState = jest.fn()
const createChange = jest.fn()
const updateChange = jest.fn()
const findOneChange = jest.fn()

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
    findOne: (...args: unknown[]) => findOneChange(...args),
  },
  DiscordRoleState: {
    find: (...args: unknown[]) => findState(...args),
    findOne: (...args: unknown[]) => findOneState(...args),
  },
  DiscordMessageTemplate: {},
}))

const findChange = jest.fn()

const chain = (value: unknown) => ({
  select: () => chain(value),
  sort: () => chain(value),
  limit: () => chain(value),
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
  jest.clearAllMocks()
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
})

afterEach(() => resetRuntimeConfigForTests())

test('DiscordRoles preview bounds both planner sources and performs no local writes', async () => {
  const { generateDiscordRolesPlan } = await import('../../src/services/renewal/discord/planning')

  const result = await (generateDiscordRolesPlan as unknown as (options: unknown) => Promise<Record<string, unknown>>)(
    { dryRun: true },
  )

  expect(result).toMatchObject({ dryRun: true, truncated: false, remaining: 0, limit: 20_000 })
  expect(findUser).toHaveBeenCalled()
  expect(findState).toHaveBeenCalled()
  expect(createChange).not.toHaveBeenCalled()
  expect(updateChange).not.toHaveBeenCalled()
})

test('DiscordRoles live planning rejects source overflow before expiry or change writes', async () => {
  const { generateDiscordRolesPlan } = await import('../../src/services/renewal/discord/planning')
  const sentinel = Array.from({ length: 20_001 }, (_, index) => ({ _id: String(index) }))
  findUser.mockReturnValue(chain(sentinel))

  await expect(generateDiscordRolesPlan()).rejects.toMatchObject({ status: 413, code: 'DISCORD_ROLES_PLAN_CAP_EXCEEDED' })
  expect(createChange).not.toHaveBeenCalled()
  expect(updateChange).not.toHaveBeenCalled()
})

test('DiscordRoles partial provider result propagates through receipt hooks', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockResolvedValueOnce({ data: { results: [] } } as never)
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)

  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  const hooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
  findChange.mockReturnValue(chain([{
    _id: 'change-1',
    discordUserId: 'discord-1',
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }]))

  let partialError: unknown
  try {
    await executeDiscordRolesPlan({ executedBy: 'test', phaseHooks: hooks } as never)
  } catch (error: unknown) {
    partialError = error
  }
  expect(partialError).toBeInstanceOf(Error)
  expect(partialError).toHaveProperty('message', expect.stringContaining('resultado completo'))
  expect(createChange).not.toHaveBeenCalled()
})

test('DiscordRoles resolves fallback email before the ownership boundary and never creates after lease loss', async () => {
  const { generateDiscordRolesPlan } = await import('../../src/services/renewal/discord/planning')
  findUser.mockReturnValue(chain([{
    _id: 'user-1',
    email: '',
    discord: { discordIds: ['discord-1'] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }]))
  findState.mockReturnValue(chain([]))
  const hooks = {
    assertOwnership: jest.fn(() => { throw new Error('lease lost') }),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }

  await expect(generateDiscordRolesPlan({ phaseHooks: hooks })).rejects.toThrow('lease lost')
  expect(findOneState).toHaveBeenCalled()
  expect(createChange).not.toHaveBeenCalled()
})

test('DiscordRoles job snapshots planner inputs once before expiry or execution', async () => {
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  findUser.mockReturnValueOnce(chain([])).mockReturnValueOnce(chain(
    Array.from({ length: 20_001 }, (_, index) => ({ _id: String(index) })),
  ))

  let result: Awaited<ReturnType<typeof runDiscordRolesSyncJob>>
  try {
    result = await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })
  } catch (error: unknown) {
    throw new Error(`job failed: ${error instanceof Error ? error.stack : String(error)}`)
  }
  expect(result).toMatchObject({ plan: { studentsWithClass: 0, truncated: false } })
  expect(findUser).toHaveBeenCalledTimes(1)
  expect(createChange).not.toHaveBeenCalled()
  findUser.mockReset()
})

test('DiscordRoles resolves snapshot fallback emails before expiry mutation', async () => {
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  const order: string[] = []
  findUser.mockReturnValue(chain([{
    _id: 'user-1',
    email: '',
    discord: { discordIds: ['discord-1'] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }]))
  findState.mockReturnValue(chain([]))
  findOneState.mockReturnValue({
    select: () => ({ lean: () => ({ exec: async () => { order.push('fallback-email'); return { email: 'state@example.test' } } }) }),
  })
  updateChange.mockImplementation(async () => { order.push('expiry'); return { modifiedCount: 0 } })
  createChange.mockImplementation(async () => { order.push('create'); return {} })

  await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })

  expect(order.indexOf('fallback-email')).toBeGreaterThanOrEqual(0)
  expect(order.indexOf('fallback-email')).toBeLessThan(order.indexOf('expiry'))
  expect(order.indexOf('expiry')).toBeLessThan(order.indexOf('create'))
})

test('DiscordRoles effective cap deduplicates projected changes already represented by live changes', async () => {
  const { assertEffectiveRoleExecutionCapacity } = await import('../../src/services/renewal/discord/executionSnapshot')
  const existing = Array.from({ length: 60 }, (_, index) => ({
    sourceRef: `discord-${index}`,
    status: 'PLANNED',
  }))
  const projected = [
    ...Array.from({ length: 60 }, (_, index) => ({ sourceRef: `discord-${index}` })),
    ...Array.from({ length: 40 }, (_, index) => ({ sourceRef: `new-${index}` })),
  ]

  expect(() => assertEffectiveRoleExecutionCapacity(existing, projected, 100)).not.toThrow()
})

test('DiscordRoles direct execution respects batch and approval filters in preflight', async () => {
  const { prepareDiscordRoleExecutionSnapshot, assertRoleExecutionSnapshotWithinCap } = await import('../../src/services/renewal/discord/executionSnapshot')
  const findQuery = chain([
    { _id: 'approved-target', sourceRef: 'target', planBatchId: 'target', status: 'APPROVED', plannedAt: new Date() },
  ])
  findChange.mockImplementation((query: { status?: { $in?: string[] } }) => {
    if (query.status?.$in?.includes('PLANNED')) {
      return chain([
        { _id: 'planned-other', sourceRef: 'other', planBatchId: 'other', status: 'PLANNED', plannedAt: new Date() },
        { _id: 'approved-target', sourceRef: 'target', planBatchId: 'target', status: 'APPROVED', plannedAt: new Date() },
      ])
    }
    return findQuery
  })

  const snapshot = await prepareDiscordRoleExecutionSnapshot({
    includePlanned: false,
    batchId: 'target',
    limit: 100,
  })
  expect(snapshot.changes.map((change) => String(change._id))).toEqual(['approved-target'])
  expect(() => assertRoleExecutionSnapshotWithinCap(snapshot)).not.toThrow()
})

test('DiscordRoles invalid business result does not complete provider phase or localize failure', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockResolvedValueOnce({
    data: { results: [{ discordUserId: 'discord-1', ok: false, error: 'provider rejected' }] },
  } as never)
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)

  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  const hooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
  findChange.mockReturnValue(chain([{
    _id: 'change-1',
    discordUserId: 'discord-1',
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }]))
  updateChange.mockClear()

  let invalidError: unknown
  try {
    await executeDiscordRolesPlan({ executedBy: 'test', phaseHooks: hooks } as never)
  } catch (error: unknown) {
    invalidError = error
  }
  expect(invalidError).toBeInstanceOf(Error)
  expect(invalidError).toHaveProperty('message', 'provider rejected')
  expect(hooks.providerSucceeded).not.toHaveBeenCalled()
  expect(updateChange).toHaveBeenCalledTimes(1)
})

test('DiscordRoles rejects provider result type drift before local writes', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockResolvedValueOnce({
    data: { results: [{ discordUserId: 'discord-1', ok: true, notInGuild: 'yes' }] },
  } as never)
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)

  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  const hooks = {
    assertOwnership: jest.fn(),
    providerStarted: jest.fn(),
    providerSucceeded: jest.fn(),
    localMutationStarted: jest.fn(),
  }
  findChange.mockReturnValue(chain([{
    _id: 'change-1',
    discordUserId: 'discord-1',
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }]))

  await expect(executeDiscordRolesPlan({ executedBy: 'test', phaseHooks: hooks } as never))
    .rejects.toThrow('resultado do bot inválido')
  expect(hooks.providerSucceeded).not.toHaveBeenCalled()
})
