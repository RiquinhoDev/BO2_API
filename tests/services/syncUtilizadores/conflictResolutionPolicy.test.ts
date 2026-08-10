import {
  canAutoResolveConflict,
  getAutoResolutionPlan,
  getSuggestedConflictAction
} from '../../../src/services/syncUtilizadoresServices/conflictDetection/resolutionPolicy'

describe('conflict auto-resolution policy', () => {
  it('never auto-resolves critical conflicts', () => {
    expect(canAutoResolveConflict({ conflictType: 'CLASS_CONFLICT', severity: 'CRITICAL' })).toBe(false)
  })

  it('auto-resolves supported non-critical conflicts at the existing confidence threshold', () => {
    expect(canAutoResolveConflict({ conflictType: 'MISSING_DATA', severity: 'MEDIUM' })).toBe(true)
    expect(getSuggestedConflictAction({ conflictType: 'MISSING_DATA', severity: 'MEDIUM' })).toBe('KEPT_EXISTING')
    expect(getAutoResolutionPlan({ conflictType: 'MISSING_DATA', severity: 'MEDIUM' })).toEqual({
      action: 'KEPT_EXISTING',
      reason: 'Dados novos incompletos, mantendo existentes'
    })
  })

  it('fails closed for unsupported conflict types', () => {
    expect(canAutoResolveConflict({ conflictType: 'DUPLICATE_EMAIL', severity: 'LOW' })).toBe(false)
    expect(getSuggestedConflictAction({ conflictType: 'DUPLICATE_EMAIL', severity: 'LOW' })).toBe('MANUAL')
  })
})
