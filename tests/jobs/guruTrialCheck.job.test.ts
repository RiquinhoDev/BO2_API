const mockSyncTrialsFromGuru = jest.fn()
const mockCheckExpiredTrials = jest.fn()
const mockRunGuruTrialCheck = jest.fn()

jest.mock('../../src/services/guru/guruTrialService', () => ({
  syncTrialsFromGuru: mockSyncTrialsFromGuru,
  checkExpiredTrials: mockCheckExpiredTrials,
  runGuruTrialCheck: mockRunGuruTrialCheck,
}))

import guruTrialCheckJob from '../../src/jobs/guruTrialCheck.job'

describe('guruTrialCheckJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRunGuruTrialCheck.mockReset()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the stable failure contract when Guru rejects with null', async () => {
    mockRunGuruTrialCheck.mockRejectedValueOnce(null)

    await expect(guruTrialCheckJob.run()).resolves.toEqual({
      success: false,
      total: 0,
      updated: 0,
      errors: 1,
      synced: 0,
      markedForInactivation: 0,
      converted: 0,
      error: 'Execução Guru TrialCheck falhou',
    })
    expect(mockSyncTrialsFromGuru).not.toHaveBeenCalled()
    expect(mockCheckExpiredTrials).not.toHaveBeenCalled()
  })

  it('forwards manual options and reports a merged read-only plan', async () => {
    mockRunGuruTrialCheck.mockResolvedValueOnce({
      checked: 1,
      synced: 2,
      markedForInactivation: 1,
      converted: 0,
      stillInTrial: 0,
      errors: 0,
      dryRun: true,
      plan: {
        operation: 'guru-trial-check',
        dryRun: true,
        candidates: 1,
        synced: 2,
        markedForInactivation: 1,
        converted: 0,
        stillInTrial: 0,
        plannedMutations: 3,
        errors: 0,
        limit: 20000,
        truncated: false,
        remaining: 0,
        anomaly: false,
      },
    })
    const phaseHooks = {
      providerStarted: jest.fn(),
      providerSucceeded: jest.fn(),
      localMutationStarted: jest.fn(),
      assertOwnership: jest.fn(),
    }

    await expect(guruTrialCheckJob.run({ dryRun: true, phaseHooks })).resolves.toMatchObject({
      success: true,
      plan: { operation: 'guru-trial-check', dryRun: true, synced: 2 },
    })
    expect(mockRunGuruTrialCheck).toHaveBeenCalledWith({ dryRun: true, phaseHooks })
    expect(mockSyncTrialsFromGuru).not.toHaveBeenCalled()
    expect(mockCheckExpiredTrials).not.toHaveBeenCalled()
  })
})
