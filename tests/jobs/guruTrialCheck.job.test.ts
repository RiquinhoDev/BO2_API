const mockSyncTrialsFromGuru = jest.fn()
const mockCheckExpiredTrials = jest.fn()

jest.mock('../../src/services/guru/guruTrialService', () => ({
  syncTrialsFromGuru: mockSyncTrialsFromGuru,
  checkExpiredTrials: mockCheckExpiredTrials,
}))

import guruTrialCheckJob from '../../src/jobs/guruTrialCheck.job'

describe('guruTrialCheckJob', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('returns the stable failure contract when Guru rejects with null', async () => {
    mockSyncTrialsFromGuru.mockRejectedValueOnce(null)

    await expect(guruTrialCheckJob.run()).resolves.toEqual({
      success: false,
      total: 0,
      updated: 0,
      errors: 1,
      synced: 0,
      markedForInactivation: 0,
      converted: 0,
    })
    expect(mockCheckExpiredTrials).not.toHaveBeenCalled()
  })
})
