import { getOps02HardeningGaps } from '../../src/security/ops02Policy'

describe('OPS-02 hardening debt ratchet', () => {
  test('tracks the reviewed hardening backlog and its internal gaps', () => {
    const gaps = getOps02HardeningGaps()
    const internal = gaps.filter((decision) => decision.scope === 'internal')
    const summary = {
      total: gaps.length,
      mixed: gaps.filter((decision) => decision.scope === 'mixed').length,
      provider: gaps.filter((decision) => decision.scope === 'provider').length,
      internal: internal.length,
      bulk: gaps.filter((decision) => decision.bulk).length,
    }

    expect(summary).toEqual({
      total: 18,
      mixed: 6,
      provider: 12,
      internal: 0,
      bulk: 13,
    })

    expect(internal).toEqual([])
  })
})
