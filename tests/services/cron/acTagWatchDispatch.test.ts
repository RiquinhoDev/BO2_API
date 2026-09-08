const mockRun = jest.fn()
const mockMutable = jest.fn()
jest.mock('../../../src/services/renewal/acTagWatch.service', () => ({ correrAcTagWatch: mockRun }))
jest.mock('../../../src/services/requestDrivenRuntimeConfig', () => ({ isSyncMutableExecutionEnabled: mockMutable }))
import { dispatchAcTagWatch } from '../../../src/services/cron/scheduler/acTagWatchDispatch'
import { mainParityLocalMutationStarted } from '../../../src/services/renewal/mainParityExecution'

const hooks = { assertOwnership: jest.fn(), providerStarted: jest.fn(), providerSucceeded: jest.fn(), localMutationStarted: jest.fn() }
beforeEach(() => { jest.resetAllMocks(); mockMutable.mockReturnValue(true); mockRun.mockResolvedValue({ errors: [] }) })

test('scheduled live execution requires ownership hooks and mutable flag before starting', async () => {
  await expect(dispatchAcTagWatch()).rejects.toMatchObject({ status: 503 })
  mockMutable.mockReturnValue(false)
  await expect(dispatchAcTagWatch({ phaseHooks: hooks })).rejects.toMatchObject({ status: 503 })
  expect(mockRun).not.toHaveBeenCalled()
})

test('dry run reads without requesting a mutable execution', async () => {
  mockMutable.mockReturnValue(false)
  await dispatchAcTagWatch({ dryRun: true })
  expect(mockRun).toHaveBeenCalledWith({ dryRun: true, actualizarEspelho: false })
})

test('scheduled effects stay inside the shared ownership context', async () => {
  mockRun.mockImplementation(async () => { mainParityLocalMutationStarted(); return { errors: [] } })
  await dispatchAcTagWatch({ phaseHooks: hooks })
  expect(hooks.assertOwnership).toHaveBeenCalled()
  expect(hooks.localMutationStarted).toHaveBeenCalledTimes(1)
})

test('partial report rejects so outer receipt cannot complete successfully', async () => {
  mockRun.mockResolvedValue({ errors: [{ error: 'provider partial' }] })
  await expect(dispatchAcTagWatch({ phaseHooks: hooks })).rejects.toThrow('incomplete')
})
