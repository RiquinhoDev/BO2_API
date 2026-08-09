import { buildReason } from '../../src/controllers/acTags/activeCampaignHistoryReason'

describe('ActiveCampaign communication reason', () => {
  it('does not render unknown inactivity as null days', () => {
    const reason = buildReason({
      userStateSnapshot: {
        daysSinceLastLogin: null,
        daysSinceLastAction: null,
        currentProgress: 0,
        currentPhase: 'INICIO',
      },
    })

    expect(reason).toBe('progresso 0%')
    expect(reason).not.toContain('null dias')
  })
})
