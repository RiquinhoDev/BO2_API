import { projectRaioxComplements } from '../../../src/services/clareza/core/coreRaioxComplementReader'

describe('Raio-X complement projection', () => {
  it('copies only bounded record histories into canonical dataset names', () => {
    const result = projectRaioxComplements({
      aapl: {
        inc: [{ date: '2025-12-31' }, null, 'invalid'],
        ea: [{ date: '2026-07-31' }],
      },
      BROKEN: 'invalid',
    })

    expect(result).toEqual(new Map([['AAPL', {
      annualIncome: [{ date: '2025-12-31' }],
      earnings: [{ date: '2026-07-31' }],
    }]]))
  })
})
