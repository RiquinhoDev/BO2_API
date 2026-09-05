const mockFindOneAndUpdate = jest.fn()
const mockFindByIdAndUpdate = jest.fn()
const mockFindById = jest.fn()
const mockUpdateMany = jest.fn()
const mockUserFindByIdAndUpdate = jest.fn()

jest.mock('../../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: mockFindOneAndUpdate,
    findById: mockFindById,
    findByIdAndUpdate: mockFindByIdAndUpdate,
    updateMany: mockUpdateMany,
  },
}))

jest.mock('../../../src/models/user', () => ({
  __esModule: true,
  default: { findByIdAndUpdate: mockUserFindByIdAndUpdate },
}))

import { mongooseGuruExternalInactivationRepository } from '../../../src/services/guru/mongooseGuruExternalInactivation.repository'
import {
  createGuruExternalInactivationService,
} from '../../../src/services/guru/guruExternalInactivation.service'

beforeEach(() => {
  jest.clearAllMocks()
  mockFindOneAndUpdate.mockResolvedValue({ _id: 'product-1' })
  mockFindById.mockReset()
  mockFindByIdAndUpdate.mockResolvedValue({ _id: 'product-1' })
  mockUpdateMany.mockResolvedValue({ acknowledged: true })
  mockUserFindByIdAndUpdate.mockResolvedValue({ _id: 'user-1' })
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const setupStatefulMutation = (options: {
  failUserOnce?: boolean
  failProductOnce?: boolean
}) => {
  let productStatus = 'PARA_INATIVAR'
  let productClaimId: string | undefined
  let userMemberStatus = 'ACTIVE'
  let failUserOnce = options.failUserOnce === true
  let failProductOnce = options.failProductOnce === true

  const query = {
    populate: jest.fn().mockReturnThis(),
    lean: jest.fn(async () => ({
      _id: 'product-1',
      userId: {
        _id: 'user-1',
        email: 'user@example.test',
        curseduca: { curseducaUserId: 'member-1' },
      },
      platformUserId: 'member-1',
      status: productStatus,
    })),
  }
  mockFindById.mockImplementation(() => query)
  mockUserFindByIdAndUpdate.mockImplementation(async () => {
    if (failUserOnce) {
      failUserOnce = false
      throw new Error('user write failed')
    }
    userMemberStatus = 'INACTIVE'
    return { _id: 'user-1' }
  })
  mockFindOneAndUpdate.mockImplementation(async (
    _filter: Record<string, unknown>,
    update: Record<string, unknown>,
  ) => {
    const set = update.$set
    if (isRecord(set)) {
      const claimId = set['metadata.inactivationClaimId']
      if (typeof claimId === 'string') productClaimId = claimId
      if (set.status === 'INACTIVE') {
        if (failProductOnce) {
          failProductOnce = false
          throw new Error('product terminal write failed')
        }
        productStatus = 'INACTIVE'
      }
    }
    const unset = update.$unset
    if (isRecord(unset)) productClaimId = undefined
    return { _id: 'product-1' }
  })

  return {
    getState: () => ({ productStatus, productClaimId, userMemberStatus }),
  }
}

test('claims only a non-inactive enrollment with no live lease in one atomic update', async () => {
  const at = new Date('2026-09-05T10:00:00.000Z')
  const leaseExpiresAt = new Date('2026-09-05T10:01:00.000Z')

  await expect(mongooseGuruExternalInactivationRepository.claimInactivation(
    'product-1',
    'claim-1',
    at,
    leaseExpiresAt,
  )).resolves.toBe(true)

  expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
    {
      _id: 'product-1',
      status: { $ne: 'INACTIVE' },
      $or: [
        { 'metadata.inactivationClaimExpiresAt': { $exists: false } },
        { 'metadata.inactivationClaimExpiresAt': { $lte: at } },
      ],
    },
    {
      $set: {
        'metadata.inactivationClaimId': 'claim-1',
        'metadata.inactivationClaimedAt': at,
        'metadata.inactivationClaimExpiresAt': leaseExpiresAt,
        'metadata.inactivationAttemptAt': at,
      },
    },
    { new: true },
  )
})

test('claim miss is observable and release is scoped to the owning claim', async () => {
  mockFindOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({ _id: 'product-1' })
  const at = new Date('2026-09-05T10:00:00.000Z')

  await expect(mongooseGuruExternalInactivationRepository.claimInactivation(
    'product-1',
    'claim-1',
    at,
    new Date('2026-09-05T10:01:00.000Z'),
  )).resolves.toBe(false)
  await mongooseGuruExternalInactivationRepository.releaseInactivationClaim('product-1', 'claim-1')

  expect(mockFindOneAndUpdate).toHaveBeenNthCalledWith(
    2,
    { _id: 'product-1', 'metadata.inactivationClaimId': 'claim-1' },
    {
      $unset: {
        'metadata.inactivationClaimId': 1,
        'metadata.inactivationClaimedAt': 1,
        'metadata.inactivationClaimExpiresAt': 1,
      },
    },
  )
})

test('success and failure clear only their own durable claim', async () => {
  const enrollment = {
    id: 'product-1',
    userId: 'user-1',
    memberId: 'member-1',
    hasCurseducaUser: true,
  }
  const at = new Date('2026-09-05T10:00:00.000Z')

  await mongooseGuruExternalInactivationRepository.markInactive(
    enrollment,
    at,
    'guru_integration',
    { ok: true },
    'claim-1',
  )
  await mongooseGuruExternalInactivationRepository.recordFailure(
    'product-1',
    at,
    'provider crashed',
    'claim-2',
  )

  expect(mockFindOneAndUpdate).toHaveBeenNthCalledWith(
    1,
    { _id: 'product-1', 'metadata.inactivationClaimId': 'claim-1' },
    expect.objectContaining({
      $set: expect.objectContaining({ status: 'INACTIVE' }),
      $unset: expect.objectContaining({
        'metadata.inactivationClaimId': 1,
        'metadata.inactivationClaimExpiresAt': 1,
      }),
    }),
    { new: true },
  )
  expect(mockFindOneAndUpdate).toHaveBeenNthCalledWith(
    2,
    { _id: 'product-1', 'metadata.inactivationClaimId': 'claim-2' },
    expect.objectContaining({
      $set: expect.objectContaining({ 'metadata.inactivationError': 'provider crashed' }),
      $unset: expect.objectContaining({
        'metadata.inactivationClaimId': 1,
        'metadata.inactivationClaimExpiresAt': 1,
      }),
    }),
  )
  expect(mockUserFindByIdAndUpdate).toHaveBeenCalledWith('user-1', {
    $set: {
      'curseduca.memberStatus': 'INACTIVE',
      'curseduca.inactivatedAt': at,
    },
  })
})

test('user mutation failure leaves product pending and retry repairs both records', async () => {
  const state = setupStatefulMutation({ failUserOnce: true })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(
    mongooseGuruExternalInactivationRepository,
    { inactivate },
    { enabled: () => true },
  )

  await expect(service.inactivateSingle({ userProductId: 'product-1' })).resolves.toMatchObject({
    kind: 'remote-failure',
    error: 'user write failed',
  })
  expect(state.getState()).toEqual({
    productStatus: 'PARA_INATIVAR',
    productClaimId: undefined,
    userMemberStatus: 'ACTIVE',
  })

  await expect(service.inactivateSingle({ userProductId: 'product-1' })).resolves.toMatchObject({
    kind: 'success',
  })
  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(state.getState()).toEqual({
    productStatus: 'INACTIVE',
    productClaimId: undefined,
    userMemberStatus: 'INACTIVE',
  })
})

test('terminal UserProduct failure remains retryable after User mutation', async () => {
  const state = setupStatefulMutation({ failProductOnce: true })
  const inactivate = jest.fn(async () => ({ success: true as const, response: { ok: true } }))
  const service = createGuruExternalInactivationService(
    mongooseGuruExternalInactivationRepository,
    { inactivate },
    { enabled: () => true },
  )

  await expect(service.inactivateSingle({ userProductId: 'product-1' })).resolves.toMatchObject({
    kind: 'remote-failure',
    error: 'product terminal write failed',
  })
  expect(state.getState()).toEqual({
    productStatus: 'PARA_INATIVAR',
    productClaimId: undefined,
    userMemberStatus: 'INACTIVE',
  })

  await expect(service.inactivateSingle({ userProductId: 'product-1' })).resolves.toMatchObject({
    kind: 'success',
  })
  expect(inactivate).toHaveBeenCalledTimes(2)
  expect(state.getState()).toEqual({
    productStatus: 'INACTIVE',
    productClaimId: undefined,
    userMemberStatus: 'INACTIVE',
  })
})
