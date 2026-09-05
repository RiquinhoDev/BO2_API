import {
  createGuruExternalInactivationService,
  type ExternalInactivationEnrollment,
  type GuruExternalInactivationRepository,
} from '../../../src/services/guru/guruExternalInactivation.service'
import type { CurseducaInactivationClient } from '../../../src/services/guru/curseducaInactivation.client'

const enrollment = (
  id: string,
  memberId = id,
): ExternalInactivationEnrollment => ({
  id,
  userId: `user-${id}`,
  email: `${id}@example.test`,
  memberId,
  hasCurseducaUser: true,
})

const repository = (
  overrides: Partial<GuruExternalInactivationRepository> = {},
): GuruExternalInactivationRepository => ({
  findOne: jest.fn(async () => enrollment('product-1')),
  findMany: jest.fn(async () => [enrollment('product-1')]),
  markDuplicates: jest.fn(async () => undefined),
  markInactive: jest.fn(async () => undefined),
  recordFailure: jest.fn(async () => undefined),
  ...overrides,
})

const client = (
  inactivate: CurseducaInactivationClient['inactivate'],
): CurseducaInactivationClient => ({ inactivate })

test('single replay calls the provider again because no provider idempotency guard exists', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate))

  await service.inactivateSingle({ userProductId: 'product-1' })
  await service.inactivateSingle({ userProductId: 'product-1' })

  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(repo.markInactive).toHaveBeenCalledTimes(2)
})

test('bulk explicit-id replay calls the provider again after local success', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    sleep: async () => undefined,
  })

  await service.inactivateBulk({ userProductIds: ['product-1'] })
  await service.inactivateBulk({ userProductIds: ['product-1'] })

  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(repo.markInactive).toHaveBeenCalledTimes(2)
})

test('bulk all mode processes more than the caller cap and has no service-side finite cap', async () => {
  const enrollments = Array.from({ length: 201 }, (_value, index) => enrollment(`product-${index}`))
  const repo = repository({ findMany: jest.fn(async () => enrollments) })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    sleep: async () => undefined,
  })

  const result = await service.inactivateBulk({ all: true })

  expect(result).toMatchObject({ processed: 201, succeeded: 201, failed: 0 })
  expect(inactivate).toHaveBeenCalledTimes(201)
})

test('bulk continues after a provider failure and records retry metadata', async () => {
  const repo = repository({
    findMany: jest.fn(async () => [enrollment('product-1'), enrollment('product-2')]),
  })
  const inactivate = jest.fn()
    .mockResolvedValueOnce({ success: false as const, error: 'remote failure' })
    .mockResolvedValueOnce({ success: true as const, response: { ok: true } })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    sleep: async () => undefined,
  })

  const result = await service.inactivateBulk({ userProductIds: ['product-1', 'product-2'] })

  expect(result).toMatchObject({ processed: 2, succeeded: 1, failed: 1 })
  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(repo.markInactive).toHaveBeenCalledTimes(1)
  expect(repo.recordFailure).toHaveBeenCalledWith(
    'product-1',
    expect.any(Date),
    'remote failure',
  )
})
