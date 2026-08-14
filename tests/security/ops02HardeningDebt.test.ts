import { getOps02HardeningGaps } from '../../src/security/ops02Policy'

describe('OPS-02 hardening debt ratchet', () => {
  test('tracks the reviewed hardening backlog without hidden internal gaps', () => {
    const gaps = getOps02HardeningGaps()
    const mixed = gaps.filter((decision) => decision.scope === 'mixed')
    const provider = gaps.filter((decision) => decision.scope === 'provider')
    const internal = gaps.filter((decision) => decision.scope === 'internal')
    const bulk = gaps.filter((decision) => decision.bulk)

    expect(gaps).toHaveLength(45)
    expect(mixed).toHaveLength(28)
    expect(provider).toHaveLength(17)
    expect(internal).toHaveLength(0)
    expect(bulk).toHaveLength(32)
  })
})
