import { HotmartExpirationPolicy } from '../../../src/services/syncUtilizadoresServices/universalSync/hotmartExpiration'
import {
  detectRenewal,
  planInactiveAutofix,
  type RenewalUserState,
} from '../../../src/services/syncUtilizadoresServices/universalSync/renewalPolicy'

// Deterministic characterization of the pure renewal decisions. No Mongo, no I/O.

const clock = { now: () => new Date('2026-08-08T00:00:00.000Z') }
const policy = new HotmartExpirationPolicy(clock)
const RECENT = new Date('2026-07-01T00:00:00.000Z')
const OLD = new Date('2024-01-01T00:00:00.000Z')

function user(status: 'ACTIVE' | 'INACTIVE', className?: string): RenewalUserState {
  return {
    combined: { status },
    hotmart: {
      enrolledClasses: className
        ? [{ classId: 'C1', className, isActive: true }]
        : [],
    },
  }
}

afterEach(() => {
  jest.restoreAllMocks()
})

describe('detectRenewal', () => {
  it('reactivates an INACTIVE hotmart user whose purchase access is still valid', () => {
    expect(detectRenewal(user('INACTIVE'), RECENT, 'hotmart', policy)).toEqual({
      shouldReactivate: true,
      reactivationReason: 'sync',
      evidence: {
        kind: 'purchase',
        purchaseDate: RECENT,
        daysSincePurchase: 38,
      },
    })
  })

  it('returns structured class evidence when the active class carries a future period', () => {
    expect(detectRenewal(user('INACTIVE', 'Turma 10 [renov] | 2705'), null, 'hotmart', policy)).toEqual({
      shouldReactivate: true,
      reactivationReason: 'sync',
      evidence: {
        kind: 'class',
        accessEnd: new Date('2028-05-31T23:59:59.999Z'),
        className: 'Turma 10 [renov] | 2705',
      },
    })
  })

  it('does not reactivate an ACTIVE user', () => {
    expect(detectRenewal(user('ACTIVE'), RECENT, 'hotmart', policy)).toEqual({ shouldReactivate: false })
  })

  it('does not reactivate when access is already expired', () => {
    expect(detectRenewal(user('INACTIVE'), OLD, 'hotmart', policy)).toEqual({ shouldReactivate: false })
  })

  it('is a no-op for non-hotmart syncs', () => {
    expect(detectRenewal(user('INACTIVE'), RECENT, 'curseduca', policy)).toEqual({ shouldReactivate: false })
  })

  it('never logs while deciding', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    detectRenewal(user('INACTIVE'), RECENT, 'hotmart', policy)
    planInactiveAutofix(user('INACTIVE'), RECENT, undefined, policy)
    expect(log).not.toHaveBeenCalled()
  })
})

describe('planInactiveAutofix', () => {
  it('reactivates INACTIVE + evaluable + not expired via the purchaseDate branch', () => {
    expect(planInactiveAutofix(user('INACTIVE'), RECENT, undefined, policy)).toEqual({
      reactivate: true,
      validity: { kind: 'purchase', daysSincePurchase: 38 },
    })
  })

  it('uses the class access-end when the class name carries a future period', () => {
    expect(planInactiveAutofix(user('INACTIVE'), null, 'Turma 10 [renov] | 2705', policy)).toEqual({
      reactivate: true,
      validity: { kind: 'class', accessEnd: new Date('2028-05-31T23:59:59.999Z') },
    })
  })

  it('does not reactivate an ACTIVE user', () => {
    expect(planInactiveAutofix(user('ACTIVE'), RECENT, undefined, policy)).toEqual({ reactivate: false })
  })

  it('does not reactivate when access is expired', () => {
    expect(planInactiveAutofix(user('INACTIVE'), OLD, undefined, policy)).toEqual({ reactivate: false })
  })
})
