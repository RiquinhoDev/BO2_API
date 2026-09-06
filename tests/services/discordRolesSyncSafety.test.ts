import { initializeRuntimeConfig, resetRuntimeConfigForTests } from '../../src/config/runtimeConfig'
import { createTestRuntimeConfig } from '../support/runtimeConfig'

const findUser = jest.fn()
const findState = jest.fn()
const createChange = jest.fn()
const updateChange = jest.fn()

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
    findOne: jest.fn(),
  },
  DiscordRoleState: {
    find: (...args: unknown[]) => findState(...args),
    findOne: jest.fn(),
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
  findChange.mockReturnValue(chain([]))
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

  await expect(executeDiscordRolesPlan({ executedBy: 'test', phaseHooks: hooks } as never)).rejects.toThrow('resultado completo')
  expect(createChange).not.toHaveBeenCalled()
})
