const mockFind = jest.fn()
jest.mock('../../../src/models/CompositeExecutionReceipt', () => ({ __esModule: true, default: { findOne: mockFind } }))
import { getMainParityExecutionStatus } from '../../../src/services/renewal/mainParityExecutionStatus'

function receipt(value: unknown) {
  const chain = { select: jest.fn(), sort: jest.fn(), maxTimeMS: jest.fn(), lean: jest.fn(), exec: async () => value }
  for (const method of [chain.select, chain.sort, chain.maxTimeMS, chain.lean]) method.mockReturnValue(chain)
  mockFind.mockReturnValue(chain)
  return chain
}
test('empty durable history is idle', async () => {
  receipt(null)
  expect(await getMainParityExecutionStatus('test-job')).toMatchObject({ inProgress: false, status: 'idle', lastReport: null })
  expect(mockFind).toHaveBeenLastCalledWith({ operation: 'sync-pipeline', identity: 'renewal-parity:test-job' })
})
test('live receipt supplies shared progress without owner or actor fields', async () => {
  const chain = receipt({ status: 'running', leaseExpiresAt: new Date('2100-01-01'), startedAt: new Date(), requestId: 'request-1', ownerId: 'private', actorId: 'private' })
  const result = await getMainParityExecutionStatus('test-job')
  expect(result).toMatchObject({ inProgress: true, status: 'running', requestId: 'request-1' })
  expect(result).not.toHaveProperty('ownerId'); expect(result).not.toHaveProperty('actorId')
  expect(chain.maxTimeMS).toHaveBeenCalledWith(5000)
})
test('expired lease is never presented as active or completed', async () => {
  receipt({ status: 'running', leaseExpiresAt: new Date('2000-01-01') })
  expect(await getMainParityExecutionStatus('test-job')).toMatchObject({ inProgress: false, status: 'lease-expired' })
})
test('completed durable report survives process restart', async () => {
  receipt({ status: 'completed', result: { updated: 10 }, finishedAt: new Date('2026-09-08') })
  expect(await getMainParityExecutionStatus('test-job')).toMatchObject({ status: 'completed', lastReport: { updated: 10 } })
})
