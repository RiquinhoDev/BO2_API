import { assessLegacyRetirement } from '../../../src/services/clareza/operations/coreLegacyRetirement'

const eligibleInput = () => ({
  legacyId: 'GET php/radar',
  replacementId: 'GET /api/clareza/radar',
  observation: {
    from: '2026-08-01T00:00:00.000Z',
    to: '2026-08-31T00:00:00.000Z',
    minimumDays: 30,
    legacyRequests: 0,
  },
  remainingConsumers: [] as string[],
  replacementStable: true,
  rollbackAvailable: true,
  explicitRemovalAuthorization: true,
})

describe('Clareza legacy retirement', () => {
  it('blocks removal while traffic, consumers, stability, rollback or authorization are unresolved', () => {
    expect(assessLegacyRetirement({
      ...eligibleInput(),
      observation: { ...eligibleInput().observation, legacyRequests: 1 },
      remainingConsumers: ['wordpress-page'],
      replacementStable: false,
      rollbackAvailable: false,
      explicitRemovalAuthorization: false,
    })).toEqual({
      status: 'blocked',
      blockers: [
        'legacy-traffic-observed',
        'remaining-consumers:wordpress-page',
        'replacement-not-stable',
        'rollback-unavailable',
        'removal-not-authorized',
      ],
    })
  })

  it('fails closed for an invalid or insufficient observation window', () => {
    expect(assessLegacyRetirement({
      ...eligibleInput(),
      observation: { from: '2026-08-31T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z', minimumDays: 30, legacyRequests: 0 },
    }).blockers).toEqual(['observation-window-invalid'])

    expect(assessLegacyRetirement({
      ...eligibleInput(),
      observation: { from: '2026-08-20T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z', minimumDays: 30, legacyRequests: 0 },
    }).blockers).toEqual(['observation-window-too-short'])
  })

  it('marks eligibility without deleting anything', () => {
    expect(assessLegacyRetirement(eligibleInput())).toEqual({ status: 'eligible', blockers: [] })
  })
})
