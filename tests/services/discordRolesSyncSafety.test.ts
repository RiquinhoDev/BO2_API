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
  jest.restoreAllMocks()
  jest.resetAllMocks()
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

test('DiscordRoles prepared execution deduplicates accounts before provider cap', async () => {
  const axios = await import('axios')
  const operations: string[] = []
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    operations.push(...payload.operations.map(({ discordUserId }) => discordUserId))
    return {
      data: {
        results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })),
      },
    } as never
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

  const result = await executeDiscordRolesPlan({
    executedBy: 'test',
    preparedChanges,
    skipExpiry: true,
  } as never)

  expect(result).toMatchObject({ attempted: 99, leftForNextRun: 0 })
  expect(new Set(operations).size).toBe(99)
  expect(operations).toHaveLength(99)
})

test('DiscordRoles prepared execution rejects conflicting duplicate payloads', async () => {
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')

  await expect(executeDiscordRolesPlan({
    executedBy: 'test',
    preparedChanges: [
      { _id: 'change-1', discordUserId: 'discord-1', payload: { addRoleId: 'role-1', removeRoleIds: [] } },
      { _id: 'change-2', discordUserId: 'discord-1', payload: { addRoleId: 'role-2', removeRoleIds: [] } },
    ],
    skipExpiry: true,
  } as never)).rejects.toMatchObject({ status: 409, code: 'DISCORD_ROLES_DUPLICATE_CONFLICT' })
})

test('DiscordRoles cron bounds 101 prepared operations and reports one remaining', async () => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockImplementation(async (_url, body) => {
    const payload = body as { operations: Array<{ discordUserId: string }> }
    return {
      data: { results: payload.operations.map(({ discordUserId }) => ({ discordUserId, ok: true })) },
    } as never
  })
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  const students = Array.from({ length: 101 }, (_, index) => ({
    _id: `user-${index}`,
    email: `user-${index}@example.test`,
    discord: { discordIds: [`discord-${index}`] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }))
  findUser.mockReturnValue(chain(students))
  findChange.mockReturnValue(chain([]))
  createChange.mockImplementation(async (change: Record<string, unknown>) => ({ ...change, _id: `created-${String(change.discordUserId)}` }))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true, discordRolesAutoExecute: true }, true)

  const result = await runDiscordRolesSyncJob({ triggeredBy: 'CRON' })

  expect(result.plan.planned).toBe(101)
  expect(result.execution).toMatchObject({ attempted: 100, leftForNextRun: 1 })
})

test('DiscordRoles manual execution still rejects 101 effective operations', async () => {
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  const students = Array.from({ length: 101 }, (_, index) => ({
    _id: `user-${index}`,
    email: `user-${index}@example.test`,
    discord: { discordIds: [`discord-${index}`] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }))
  findUser.mockReturnValue(chain(students))
  findChange.mockReturnValue(chain([]))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)

  await expect(runDiscordRolesSyncJob({ triggeredBy: 'MANUAL' })).rejects.toMatchObject({
    status: 413,
    code: 'DISCORD_ROLES_EXECUTION_CAP_EXCEEDED',
  })
  expect(updateChange).not.toHaveBeenCalled()
  expect(createChange).not.toHaveBeenCalled()
})

test.each([
  ['old blocked changes are eligible again', 8, 'role-1', 1],
  ['the seven-day boundary remains suppressed', 7, '1525119933300740156', 0],
  ['a rejoined account with a new role is eligible', 1, 'role-2', 1],
] as const)('DiscordRoles %s', async (_name, ageDays, blockedRole, expectedPlanned) => {
  const now = Date.parse('2026-09-06T12:00:00.000Z')
  jest.spyOn(Date, 'now').mockReturnValue(now)
  const { prepareDiscordRolesPlanSnapshot } = await import('../../src/services/renewal/discord/planSnapshot')
  findUser.mockReturnValue(chain([{
    _id: 'user-1',
    email: 'user@example.test',
    discord: { discordIds: ['discord-1'] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }]))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValueOnce(chain([{
    _id: 'blocked-1',
    sourceRef: 'discord-1',
    discordUserId: 'discord-1',
    status: 'BLOCKED',
    notInGuild: true,
    plannedAt: new Date(now - ageDays * 24 * 3600e3),
    payload: { addRoleId: blockedRole, removeRoleIds: [] },
  }])).mockReturnValueOnce(chain([]))

  const snapshot = await prepareDiscordRolesPlanSnapshot()

  expect(snapshot.report.planned).toBe(expectedPlanned)
  jest.restoreAllMocks()
})

test('DiscordRoles relevant dedupe overflow propagates as a bounded planning failure', async () => {
  const { runDiscordRolesSyncJob } = await import('../../src/services/renewal/discord/job')
  const sentinel = Array.from({ length: 20_001 }, (_, index) => ({
    _id: `blocked-${index}`,
    sourceRef: 'discord-1',
    discordUserId: 'discord-1',
    status: 'BLOCKED',
    notInGuild: true,
    plannedAt: new Date(),
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }))
  findUser.mockReturnValue(chain([{
    _id: 'user-1',
    email: 'user@example.test',
    discord: { discordIds: ['discord-1'] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }]))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValueOnce(chain(sentinel)).mockReturnValueOnce(chain([]))
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)

  await expect(runDiscordRolesSyncJob({ triggeredBy: 'CRON' })).rejects.toMatchObject({
    status: 413,
    code: 'DISCORD_ROLES_PLAN_CAP_EXCEEDED',
  })
  expect(updateChange).not.toHaveBeenCalled()
  expect(createChange).not.toHaveBeenCalled()
})

test('DiscordRoles stale dedupe records are filtered before the sentinel cap', async () => {
  const { prepareDiscordRolesPlanSnapshot } = await import('../../src/services/renewal/discord/planSnapshot')
  const stale = Array.from({ length: 20_001 }, (_, index) => ({
    _id: `blocked-${index}`,
    sourceRef: 'discord-1',
    discordUserId: 'discord-1',
    status: 'BLOCKED',
    notInGuild: true,
    plannedAt: new Date(Date.now() - 8 * 24 * 3600e3),
    payload: { addRoleId: 'role-1', removeRoleIds: [] },
  }))
  findUser.mockReturnValue(chain([{
    _id: 'user-1',
    email: 'user@example.test',
    discord: { discordIds: ['discord-1'] },
    hotmart: { enrolledClasses: [{ className: 'Turma 1 | 2505', isActive: true }] },
  }]))
  findState.mockReturnValue(chain([]))
  findChange.mockReturnValueOnce(chain(stale)).mockReturnValueOnce(chain([]))

  const snapshot = await prepareDiscordRolesPlanSnapshot()

  expect(snapshot.report.truncated).toBe(false)
  expect(snapshot.report.planned).toBe(1)
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

test.each(['Unknown User', 'DiscordAPIError[10013]', 'Unknown Member', 'DiscordAPIError[10007]'])('DiscordRoles blocks unreachable account %s without retrying as a transient failure', async (error) => {
  const axios = await import('axios')
  jest.spyOn(axios.default, 'post').mockResolvedValueOnce({
    data: { results: [{ discordUserId: 'discord-1', ok: false, error }] },
  } as never)
  resetRuntimeConfigForTests()
  install({ discordRolesSyncEnabled: true }, true)
  findChange.mockReturnValue(chain([{ _id: 'change-1', discordUserId: 'discord-1', payload: { addRoleId: 'role-1', removeRoleIds: [] } }]))
  const { executeDiscordRolesPlan } = await import('../../src/services/renewal/discord/execution')
  const result = await executeDiscordRolesPlan({ executedBy: 'test' })
  expect(result).toMatchObject({ notInGuild: 1, failed: 0, applied: 0 })
  expect(updateChange).toHaveBeenCalledWith({ _id: { $in: ['change-1'] } }, expect.objectContaining({
    $set: expect.objectContaining({ status: 'BLOCKED', notInGuild: true }),
  }))
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
