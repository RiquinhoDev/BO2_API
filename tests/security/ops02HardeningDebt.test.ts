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
      total: 23,
      mixed: 7,
      provider: 14,
      internal: 2,
      bulk: 16,
    })

    expect(internal.map((decision) => `${decision.method} ${decision.path}`).sort()).toEqual([
      'POST /api/guru/webhooks/migrate-source',
      'POST /api/users/syncDiscordAndHotmart',
    ])
  })
})
