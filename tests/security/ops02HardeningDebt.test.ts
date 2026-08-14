import { getOps02HardeningGaps } from '../../src/security/ops02Policy'

describe('OPS-02 hardening debt ratchet', () => {
  test('tracks the reviewed hardening backlog without hidden internal gaps', () => {
    const gaps = getOps02HardeningGaps()
    const summary = {
      total: gaps.length,
      mixed: gaps.filter((decision) => decision.scope === 'mixed').length,
      provider: gaps.filter((decision) => decision.scope === 'provider').length,
      internal: gaps.filter((decision) => decision.scope === 'internal').length,
      bulk: gaps.filter((decision) => decision.bulk).length,
    }

    expect(summary).toEqual({
      total: 40,
      mixed: 26,
      provider: 14,
      internal: 0,
      bulk: 31,
    })
  })
})
