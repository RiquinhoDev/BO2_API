import request from 'supertest'
import { appForCentralError } from '../support/centralErrorContract'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'

jest.mock('../../src/security/clarezaRefreshAuthorization', () => ({ isClarezaRefreshAuthorized: jest.fn(() => true) }))
jest.mock('../../src/services/clareza/canonicalSettings', () => ({ isClarezaCanonicalEnabled: () => true }))
jest.mock('../../src/services/clareza/clarezaRefreshExecution.service', () => ({
  runClarezaRefreshWithReceipt: jest.fn(async () => ({ total: 1, errors: 0 })),
}))

import { clarezaController } from '../../src/controllers/clarezaController'
import { isClarezaRefreshAuthorized } from '../../src/security/clarezaRefreshAuthorization'
import { runClarezaRefreshWithReceipt } from '../../src/services/clareza/clarezaRefreshExecution.service'

installTestRuntimeConfigHooks()
beforeEach(() => jest.clearAllMocks())

test.each(['refresh', 'refreshTop10', 'refreshRaiox', 'refreshCarteira', 'refreshEarnings', 'refreshComparador'] as const)(
  '%s cannot update legacy stores when canonical mode is enabled', async name => {
    const app = appForCentralError({ kind: 'handler', method: 'post', handler: clarezaController[name] })
    const result = await request(app).post('/target').query({ __bo2_offline_loopback: '1' }).set('x-clareza-refresh-token', 'synthetic-token')
    expect(result.status).toBe(409)
    expect(result.body.code).toBe('CLAREZA_CANONICAL_OPERATION_REQUIRED')
    expect(runClarezaRefreshWithReceipt).not.toHaveBeenCalled()
  },
)

test('legacy authentication still precedes mode-specific conflict responses', async () => {
  jest.mocked(isClarezaRefreshAuthorized).mockReturnValueOnce(false)
  const app = appForCentralError({ kind: 'handler', method: 'post', handler: clarezaController.refresh })
  const result = await request(app).post('/target').query({ __bo2_offline_loopback: '1' })
  expect(result.status).toBe(403)
  expect(runClarezaRefreshWithReceipt).not.toHaveBeenCalled()
})
