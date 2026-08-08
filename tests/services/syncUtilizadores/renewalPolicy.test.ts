import { HotmartExpirationPolicy } from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartExpiration'
import { detectRenewal, planInactiveAutofix } from '../../../src/services/syncUtilizadoresServices/universalSync/renewalPolicy'
import type { IUser } from '../../../src/models/user'

// Characterization of the pure renewal decisions extracted from processSyncItem.
// Deterministic via an injected fixed clock — no Mongo, no I/O.

const clock = { now: () => new Date('2026-08-08T00:00:00.000Z') }
const policy = new HotmartExpirationPolicy(clock)
const RECENT = new Date('2026-07-01T00:00:00.000Z') // ~38 days before now -> not expired via purchaseDate
const OLD = new Date('2024-01-01T00:00:00.000Z') // > 380 days -> expired via purchaseDate

const user = (over: Partial<IUser> = {}): IUser =>
  ({ email: 'r@x.test', name: 'Rui', combined: {}, hotmart: {}, ...over }) as unknown as IUser

describe('detectRenewal', () => {
  it('reactivates an INACTIVE hotmart user whose access is still valid', () => {
    const r = detectRenewal(user({ combined: { status: 'INACTIVE' } } as Partial<IUser>), RECENT, 'hotmart', policy)
    expect(r.shouldReactivate).toBe(true)
    expect(r.wasInactivated).toBe(true)
    expect(r.reactivationReason).toBe('sync')
    expect(r.purchaseDate).toEqual(RECENT)
  })

  it('does not reactivate an ACTIVE user', () => {
    const r = detectRenewal(user({ combined: { status: 'ACTIVE' } } as Partial<IUser>), RECENT, 'hotmart', policy)
    expect(r.shouldReactivate).toBe(false)
  })

  it('does not reactivate when access is already expired', () => {
    const r = detectRenewal(user({ combined: { status: 'INACTIVE' } } as Partial<IUser>), OLD, 'hotmart', policy)
    expect(r.shouldReactivate).toBe(false)
  })

  it('is a no-op for non-hotmart syncs', () => {
    const r = detectRenewal(user({ combined: { status: 'INACTIVE' } } as Partial<IUser>), RECENT, 'curseduca', policy)
    expect(r.shouldReactivate).toBe(false)
  })
})

describe('planInactiveAutofix', () => {
  it('reactivates INACTIVE + evaluable + not expired via the purchaseDate branch', () => {
    const p = planInactiveAutofix(user({ combined: { status: 'INACTIVE' } } as Partial<IUser>), RECENT, undefined, policy)
    expect(p.reactivate).toBe(true)
    expect(p.validUntil).toContain('compra recente')
  })

  it('uses the class access-end when the class name carries a future period', () => {
    const p = planInactiveAutofix(user({ combined: { status: 'INACTIVE' } } as Partial<IUser>), null, 'Turma 10 [renov] | 2705', policy)
    expect(p.reactivate).toBe(true)
    expect(p.validUntil).toContain('acesso válido até')
  })

  it('does not reactivate an ACTIVE user', () => {
    const p = planInactiveAutofix(user({ combined: { status: 'ACTIVE' } } as Partial<IUser>), RECENT, undefined, policy)
    expect(p.reactivate).toBe(false)
  })

  it('does not reactivate when access is expired', () => {
    const p = planInactiveAutofix(user({ combined: { status: 'INACTIVE' } } as Partial<IUser>), OLD, undefined, policy)
    expect(p.reactivate).toBe(false)
  })
})
