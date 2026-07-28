import { mapStatus } from '../../src/controllers/guru.snapshot.controller'

describe('Guru snapshot status accounting', () => {
  it.each(['trial', 'trialing'])('counts %s subscriptions as active', (status) => {
    expect(mapStatus(status)).toBe('active')
  })
})
