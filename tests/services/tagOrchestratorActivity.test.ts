const mockFindUserProduct = jest.fn()
const mockUpdateUserProduct = jest.fn()
const mockFindProduct = jest.fn()
const mockFindUser = jest.fn()
const mockCommunicationCreate = jest.fn()
const mockCommunicationUpdate = jest.fn()
const mockProductProfileFindOne = jest.fn()
const mockStudentStateFindOne = jest.fn()
const mockStudentStateCreate = jest.fn()
const mockEvaluateUserProduct = jest.fn()
const mockGetContactTags = jest.fn()
const mockApplyTag = jest.fn()
const mockRemoveTag = jest.fn()
const mockCaptureNativeTags = jest.fn()
const mockFilterSafeTags = jest.fn()
const mockIsBOTag = jest.fn()

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { findOne: mockFindUserProduct, findByIdAndUpdate: mockUpdateUserProduct },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findById: mockFindProduct },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findById: mockFindUser },
}))

jest.mock('../../src/models/acTags/CommunicationHistory', () => ({
  __esModule: true,
  default: { create: mockCommunicationCreate, findOneAndUpdate: mockCommunicationUpdate },
}))

jest.mock('../../src/models/product/ProductProfile', () => ({
  __esModule: true,
  default: { findOne: mockProductProfileFindOne },
}))

jest.mock('../../src/models/StudentEngagementState', () => ({
  __esModule: true,
  default: { findOne: mockStudentStateFindOne, create: mockStudentStateCreate },
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: { evaluateUserProduct: mockEvaluateUserProduct },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    getContactTagsByEmail: mockGetContactTags,
    applyTagToUserProduct: mockApplyTag,
    removeTagFromUserProduct: mockRemoveTag,
  },
}))

jest.mock('../../src/services/activeCampaign/nativeTagProtection.service', () => ({
  __esModule: true,
  default: {
    captureNativeTags: mockCaptureNativeTags,
    filterSafeTagsToRemove: mockFilterSafeTags,
    isBOTag: mockIsBOTag,
  },
}))

import tagOrchestratorV2 from '../../src/services/activeCampaign/tagOrchestrator.service'

type StudentStateStub = {
  lastActivityDate: unknown
  daysSinceLastLogin: unknown
  save: jest.Mock
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function makeStudentStateStub(): StudentStateStub {
  return {
    lastActivityDate: undefined,
    daysSinceLastLogin: undefined,
    save: jest.fn().mockResolvedValue(undefined),
  }
}

describe('TagOrchestrator activity signal', () => {
  let studentState: StudentStateStub

  beforeEach(() => {
    jest.clearAllMocks()
    studentState = makeStudentStateStub()

    mockFindUserProduct.mockResolvedValue({ _id: { toString: () => 'user-product-1' } })
    mockUpdateUserProduct.mockResolvedValue(null)
    mockFindProduct.mockResolvedValue({ _id: 'product-1', code: 'OGI_V1' })
    mockCommunicationCreate.mockResolvedValue({})
    mockCommunicationUpdate.mockResolvedValue({})
    mockProductProfileFindOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      }),
    })
    mockStudentStateFindOne.mockResolvedValue(studentState)
    mockStudentStateCreate.mockResolvedValue(studentState)
    // decisionEngine (twin, already fixed) drives the tag decision — keep it stable
    mockEvaluateUserProduct.mockResolvedValue({
      tagsToApply: ['OGI_V1 - Engajado'],
      tagsToRemove: [],
      errors: [],
    })
    mockGetContactTags.mockResolvedValue([])
    mockApplyTag.mockResolvedValue(true)
    mockRemoveTag.mockResolvedValue(true)
    mockCaptureNativeTags.mockResolvedValue({})
    mockFilterSafeTags.mockResolvedValue({ safeTags: [], blockedTags: [], reasons: [] })
    mockIsBOTag.mockReturnValue(true)
  })

  it('does not persist a learner as inactive when there is no activity signal', async () => {
    // User with ONLY an account creation date — no real learner activity anywhere.
    mockFindUser.mockResolvedValue({
      _id: 'user-1',
      email: 'student@example.test',
      createdAt: daysAgo(100),
    })

    const result = await tagOrchestratorV2.orchestrateUserProduct('user-1', 'product-1')

    // Sanity: we reached the persistence path (a tag was applied → studentState synced).
    expect(result.tagsApplied).toContain('OGI_V1 - Engajado')
    expect(studentState.save).toHaveBeenCalled()

    // Core: unknown activity must be persisted as null (unknown ≠ inactive),
    // NOT a large number derived from the account creation date.
    expect(studentState.daysSinceLastLogin).toBeNull()
  })

  it('persists a real inactivity number when there is a genuine activity signal', async () => {
    mockFindUser.mockResolvedValue({
      _id: 'user-1',
      email: 'student@example.test',
      createdAt: daysAgo(100),
      communicationByCourse: new Map([
        ['OGI_V1', { courseSpecificData: { lastModuleCompletedAt: daysAgo(15) } }],
      ]),
    })

    await tagOrchestratorV2.orchestrateUserProduct('user-1', 'product-1')

    expect(studentState.save).toHaveBeenCalled()
    expect(typeof studentState.daysSinceLastLogin).toBe('number')
    expect(studentState.daysSinceLastLogin).toBe(15)
  })
})
