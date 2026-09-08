import { assessClarezaRollout } from '../../../src/services/clareza/operations/coreRolloutReadiness'

const readyInput = () => ({
  tool: 'radar' as const,
  backendHead: '8ebd665',
  frontendHead: '2407d53',
  routeContractAvailable: true,
  authorizationDecisionAccepted: true,
  globalGatesPass: true,
  dr: { dr0: true, dr1: true, dr2: true, dr3: true, dr4: true, dr5: true, dr6: true },
  rollback: { tested: true, maxMinutes: 10 },
  canary: { percentage: 5, observationMinutes: 30, errorRateLimit: 0.01 },
  explicitPromotionAuthorization: true,
})

describe('Clareza rollout readiness', () => {
  it('blocks before promotion and reports every missing hard gate deterministically', () => {
    const result = assessClarezaRollout({
      ...readyInput(),
      routeContractAvailable: false,
      authorizationDecisionAccepted: false,
      globalGatesPass: false,
      dr: { dr0: true, dr1: true, dr2: true, dr3: false, dr4: false, dr5: false, dr6: false },
      rollback: { tested: false, maxMinutes: 10 },
      explicitPromotionAuthorization: false,
    })

    expect(result).toEqual({
      status: 'blocked',
      blockers: [
        'route-contract-unavailable',
        'authorization-decision-pending',
        'global-gates-failed',
        'dry-run-incomplete:dr3,dr4,dr5,dr6',
        'rollback-not-tested',
        'promotion-not-authorized',
      ],
    })
  })

  it('requires bounded canary and rollback values even when every boolean is green', () => {
    const result = assessClarezaRollout({
      ...readyInput(),
      rollback: { tested: true, maxMinutes: 0 },
      canary: { percentage: 100, observationMinutes: 0, errorRateLimit: 2 },
    })

    expect(result.status).toBe('blocked')
    expect(result.blockers).toEqual(['rollback-window-invalid', 'canary-policy-invalid'])
  })

  it('returns a reviewable ready decision without performing promotion', () => {
    expect(assessClarezaRollout(readyInput())).toEqual({ status: 'ready', blockers: [] })
  })
})
