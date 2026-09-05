import {
  createGuruExternalInactivationService,
  GuruExternalInactivationLimitError,
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
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  await service.inactivateSingle({ userProductId: 'product-1' })
  await service.inactivateSingle({ userProductId: 'product-1' })

  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(repo.markInactive).toHaveBeenCalledTimes(2)
})

test('single replay converges when the repository observes local INACTIVE state', async () => {
  const repo = repository({
    findOne: jest.fn()
      .mockResolvedValueOnce(enrollment('product-1'))
      .mockResolvedValueOnce({ ...enrollment('product-1'), status: 'INACTIVE' }),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  const first = await service.inactivateSingle({ userProductId: 'product-1' })
  const second = await service.inactivateSingle({ userProductId: 'product-1' })

  expect(first).toMatchObject({ kind: 'success', memberId: 'product-1' })
  expect(second).toMatchObject({ kind: 'success', memberId: 'product-1', alreadyInactive: true })
  expect(inactivate).toHaveBeenCalledTimes(1)
  expect(repo.markInactive).toHaveBeenCalledTimes(1)
})

test('single skips provider when the local enrollment is already INACTIVE', async () => {
  const repo = repository({
    findOne: jest.fn(async () => ({ ...enrollment('product-1'), status: 'INACTIVE' })),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  const result = await service.inactivateSingle({ userProductId: 'product-1' })

  expect(result).toMatchObject({ kind: 'success', alreadyInactive: true })
  expect(inactivate).not.toHaveBeenCalled()
  expect(repo.markInactive).not.toHaveBeenCalled()
})

test('bulk explicit-id replay calls the provider again after local success', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  await service.inactivateBulk({ userProductIds: ['product-1'] })
  await service.inactivateBulk({ userProductIds: ['product-1'] })

  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(repo.markInactive).toHaveBeenCalledTimes(2)
})

test('bulk all mode rejects results above the finite service cap before provider writes', async () => {
  const enrollments = Array.from({ length: 201 }, (_value, index) => enrollment(`product-${index}`))
  const repo = repository({ findMany: jest.fn(async () => enrollments) })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  await expect(service.inactivateBulk({ all: true })).rejects.toBeInstanceOf(
    GuruExternalInactivationLimitError,
  )

  expect(inactivate).not.toHaveBeenCalled()
  expect(repo.markDuplicates).not.toHaveBeenCalled()
  expect(repo.markInactive).not.toHaveBeenCalled()
})

test('bulk rejects direct explicit ids above the finite service cap before reading', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  await expect(service.inactivateBulk({
    userProductIds: Array.from({ length: 201 }, (_value, index) => `product-${index}`),
  })).rejects.toBeInstanceOf(GuruExternalInactivationLimitError)

  expect(repo.findMany).not.toHaveBeenCalled()
  expect(inactivate).not.toHaveBeenCalled()
})

test('bulk dry-run returns a deduplicated plan without provider or local mutations', async () => {
  const repo = repository({
    findMany: jest.fn(async () => [
      enrollment('product-1', 'member-1'),
      { ...enrollment('product-2'), memberId: undefined },
      enrollment('product-3', 'member-1'),
    ]),
  })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
    sleep: async () => undefined,
  })

  const result = await service.inactivateBulk({
    userProductIds: ['product-1', 'product-2', 'product-3'],
    dryRun: true,
  })

  expect(result).toMatchObject({
    processed: 2,
    succeeded: 0,
    failed: 1,
    dryRun: true,
    planned: 1,
  })
  expect(result.details).toEqual([
    expect.objectContaining({ userProductId: 'product-1', success: true, planned: true }),
    expect.objectContaining({ userProductId: 'product-2', success: false }),
  ])
  expect(inactivate).not.toHaveBeenCalled()
  expect(repo.markDuplicates).not.toHaveBeenCalled()
  expect(repo.markInactive).not.toHaveBeenCalled()
  expect(repo.recordFailure).not.toHaveBeenCalled()
})

test('concurrent single requests both reach the provider because no atomic claim exists', async () => {
  const repo = repository()
  let release!: () => void
  const providerBarrier = new Promise<void>((resolve) => {
    release = resolve
  })
  const inactivate = jest.fn(async () => {
    if (inactivate.mock.calls.length === 2) release()
    await providerBarrier
    return { success: true as const, response: { ok: true } }
  })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
  })

  await Promise.all([
    service.inactivateSingle({ userProductId: 'product-1' }),
    service.inactivateSingle({ userProductId: 'product-1' }),
  ])

  expect(inactivate).toHaveBeenCalledTimes(2)
})

test('disabled service fails closed without reading or mutating state', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate))

  await expect(service.inactivateSingle({ userProductId: 'product-1' })).resolves.toEqual({
    kind: 'disabled',
  })
  await expect(service.inactivateBulk({ all: true })).resolves.toEqual({
    processed: 0,
    succeeded: 0,
    failed: 0,
    details: [],
    disabled: true,
  })

  expect(repo.findOne).not.toHaveBeenCalled()
  expect(repo.findMany).not.toHaveBeenCalled()
  expect(inactivate).not.toHaveBeenCalled()
})

test('disabled dry-run reads a plan but performs no provider or local mutation', async () => {
  const repo = repository()
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(repo, client(inactivate))

  const single = await service.inactivateSingle({ userProductId: 'product-1', dryRun: true })
  const bulk = await service.inactivateBulk({ all: true, dryRun: true })

  expect(single).toMatchObject({ kind: 'dry-run', planned: true })
  expect(bulk).toMatchObject({ dryRun: true, planned: 1, processed: 1 })
  expect(repo.findOne).toHaveBeenCalledTimes(1)
  expect(repo.findMany).toHaveBeenCalledTimes(1)
  expect(repo.markDuplicates).not.toHaveBeenCalled()
  expect(repo.markInactive).not.toHaveBeenCalled()
  expect(repo.recordFailure).not.toHaveBeenCalled()
  expect(inactivate).not.toHaveBeenCalled()
})

test('bulk continues after a provider failure and records retry metadata', async () => {
  const repo = repository({
    findMany: jest.fn(async () => [enrollment('product-1'), enrollment('product-2')]),
  })
  const inactivate = jest.fn()
    .mockResolvedValueOnce({ success: false as const, error: 'remote failure' })
    .mockResolvedValueOnce({ success: true as const, response: { ok: true } })
  const service = createGuruExternalInactivationService(repo, client(inactivate), {
    enabled: () => true,
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
