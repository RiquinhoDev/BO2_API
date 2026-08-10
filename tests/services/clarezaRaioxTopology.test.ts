import { diagnoseRaiox, getRaioxAnalysis, refreshClarezaRaioxData } from '../../src/services/clareza/clarezaRaioxService'
import * as data from '../../src/services/clareza/raiox/data'
import * as runtime from '../../src/services/clareza/raiox/runtime'

describe('Clareza Raio-X topology', () => {
  it('separates market-data assembly from cache-backed use cases', () => {
    expect(typeof data.fetchCompanyRaiox).toBe('function')
    expect(runtime.refreshClarezaRaioxData).toBe(refreshClarezaRaioxData)
    expect(runtime.getRaioxAnalysis).toBe(getRaioxAnalysis)
    expect(runtime.diagnoseRaiox).toBe(diagnoseRaiox)
  })
})
