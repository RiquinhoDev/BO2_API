import { createCoreRetention } from '../../../src/services/clareza/core/coreRetention'

function generations(ids: readonly string[]) {
  const state = { ids: [...ids], retainedWith: null as number | null }
  return {
    port: {
      retainCandidates: async (limit: number) => { state.retainedWith = limit },
      listGenerationIds: async () => state.ids,
    },
    state,
  }
}

describe('core retention', () => {
  it('prunes every companion against the generations that survived', async () => {
    const { port, state } = generations(['gen-new', 'gen-previous'])
    const seen: Record<string, readonly string[]> = {}
    const retention = createCoreRetention({
      generations: port,
      companions: [
        { name: 'Raio-X', prune: async ids => { seen['Raio-X'] = ids; return 12 } },
        { name: 'Earnings', prune: async ids => { seen.Earnings = ids; return 5 } },
      ],
      candidateLimit: 3,
    })

    await expect(retention()).resolves.toEqual({
      retainedGenerations: 2,
      prunedCompanions: { 'Raio-X': 12, Earnings: 5 },
    })
    expect(state.retainedWith).toBe(3)
    expect(seen['Raio-X']).toEqual(['gen-new', 'gen-previous'])
    expect(seen.Earnings).toEqual(['gen-new', 'gen-previous'])
  })

  it('refuses to prune when no generation survived', async () => {
    const { port } = generations([])
    const prune = jest.fn()
    const retention = createCoreRetention({
      generations: port,
      companions: [{ name: 'Raio-X', prune }],
      candidateLimit: 3,
    })

    await expect(retention()).rejects.toThrow('core retention found no generation to protect')
    expect(prune).not.toHaveBeenCalled()
  })

  it('rejects invalid limits and duplicated companion names', () => {
    const { port } = generations(['gen-new'])
    expect(() => createCoreRetention({
      generations: port, companions: [], candidateLimit: 0,
    })).toThrow(RangeError)
    expect(() => createCoreRetention({
      generations: port,
      companions: [{ name: 'Raio-X', prune: async () => 0 }, { name: 'Raio-X', prune: async () => 0 }],
      candidateLimit: 3,
    })).toThrow(RangeError)
  })
})
