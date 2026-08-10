import * as access from '../../src/services/studentOgiSummary/access'
import * as legacy from '../../src/services/studentOgiSummary.service'

describe('student OGI access topology', () => {
  it('keeps the legacy access API wired to the focused module', () => {
    expect(legacy.getStudentAccess).toBe(access.getStudentAccess)
    expect(legacy.resolveStudentEmailFromToken).toBe(access.resolveStudentEmailFromToken)
    expect(legacy.isValidSummaryAccessToken).toBe(access.isValidSummaryAccessToken)
    expect(legacy.normalizeStudentEmail).toBe(access.normalizeStudentEmail)
  })
})
