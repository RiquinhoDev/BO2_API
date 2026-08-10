import { determineCrossReferenceAction } from '../../../src/services/guru/crossReference/policy'

describe('cross-reference policy', () => {
  it('marks a cancelled Guru enrollment when CursEduca is still active', () => {
    expect(determineCrossReferenceAction('canceled', 'ACTIVE', 'ACTIVE', 'ACTIVE')).toEqual({
      action: 'mark_para_inativar',
      reason: 'Discrepância: Guru canceled, CursEduca ACTIVE'
    })
  })

  it('confirms an inactive CursEduca enrollment already pending inactivation', () => {
    expect(determineCrossReferenceAction('expired', 'INACTIVE', 'INACTIVE', 'PARA_INATIVAR')).toEqual({
      action: 'confirm_inactive',
      reason: 'Guru expired + CursEduca INACTIVE (confirmado)'
    })
  })

  it('fails closed when Guru data is missing', () => {
    expect(determineCrossReferenceAction(undefined, 'ACTIVE', 'ACTIVE', 'ACTIVE')).toEqual({
      action: 'skip',
      reason: 'Sem dados Guru'
    })
  })
})
