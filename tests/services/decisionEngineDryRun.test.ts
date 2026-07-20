const mockFindUserProduct = jest.fn()
const mockFindUserProducts = jest.fn()
const mockUpdateUserProduct = jest.fn()
const mockFindProduct = jest.fn()
const mockFindUser = jest.fn()
const mockFindCourse = jest.fn()
const mockFindRules = jest.fn()
const mockFindActions = jest.fn()
const mockApplyTag = jest.fn()
const mockRemoveTag = jest.fn()

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: mockFindUserProduct,
    find: mockFindUserProducts,
    findByIdAndUpdate: mockUpdateUserProduct,
  },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {
    findById: mockFindProduct,
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findById: mockFindUser,
  },
}))

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: {
    find: mockFindRules,
  },
}))

jest.mock('../../src/models/UserAction', () => ({
  __esModule: true,
  default: {
    find: mockFindActions,
  },
}))

jest.mock('../../src/models', () => ({
  Course: {
    findOne: mockFindCourse,
  },
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {
    applyTagToUserProduct: mockApplyTag,
    removeTagFromUserProduct: mockRemoveTag,
  },
}))

import decisionEngine, {
  type DecisionResult,
} from '../../src/services/activeCampaign/decisionEngine.service'

type EngineInternals = {
  executeDecisions: (result: DecisionResult) => Promise<void>
}

describe('DecisionEngine dry-run', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()

    mockFindUserProduct.mockResolvedValue({
      _id: { toString: () => 'user-product-1' },
      engagement: {
        daysSinceLastLogin: 15,
        daysSinceLastAction: 15,
      },
      activeCampaignData: { tags: [] },
    })
    mockFindProduct.mockResolvedValue({
      _id: 'product-1',
      code: 'OGI_V1',
    })
    mockFindUser.mockResolvedValue({
      _id: 'user-1',
      email: 'student@example.test',
    })
    mockFindCourse.mockResolvedValue({ _id: 'course-1' })
    mockFindRules.mockReturnValue({
      sort: jest.fn().mockResolvedValue([
        {
          _id: 'rule-1',
          name: 'Level 1',
          actions: { addTag: 'OGI_LEVEL_1' },
          conditions: [
            {
              type: 'SIMPLE',
              field: 'daysSinceLastLogin',
              operator: 'greaterThan',
              value: 10,
            },
          ],
          priority: 2,
        },
        {
          _id: 'rule-2',
          name: 'Level 2',
          actions: { addTag: 'OGI_LEVEL_2' },
          conditions: [
            {
              type: 'SIMPLE',
              field: 'daysSinceLastLogin',
              operator: 'greaterThan',
              value: 20,
            },
          ],
          priority: 1,
        },
      ]),
    })
    mockFindActions.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
    })
    mockUpdateUserProduct.mockResolvedValue(null)
    mockApplyTag.mockResolvedValue(true)
    mockRemoveTag.mockResolvedValue(true)
  })

  it('returns proposed additions and removals without executing or persisting anything', async () => {
    const executeSpy = jest.spyOn(
      decisionEngine as unknown as EngineInternals,
      'executeDecisions',
    )

    const result = await Reflect.apply(
      decisionEngine.evaluateUserProduct,
      decisionEngine,
      ['user-1', 'product-1', true],
    )

    expect(result.tagsToApply).toEqual(['OGI_LEVEL_1'])
    expect(result.tagsToRemove).toEqual(['OGI_LEVEL_2'])
    expect(result.actionsExecuted).toBe(0)
    expect(executeSpy).not.toHaveBeenCalled()
    expect(mockApplyTag).not.toHaveBeenCalled()
    expect(mockRemoveTag).not.toHaveBeenCalled()
    expect(mockUpdateUserProduct).not.toHaveBeenCalled()
  })

  it('previews only active UserProducts for one product', async () => {
    mockFindUserProducts.mockResolvedValue([
      { userId: { toString: () => 'student-1' } },
    ])
    const evaluation = resultForProduct()
    const evaluateSpy = jest
      .spyOn(decisionEngine, 'evaluateUserProduct')
      .mockResolvedValue(evaluation)

    await decisionEngine.evaluateAllUsersOfProduct('product-1', true)

    expect(mockFindUserProducts).toHaveBeenCalledWith({
      productId: 'product-1',
      status: 'ACTIVE',
    })
    expect(evaluateSpy).toHaveBeenCalledWith('student-1', 'product-1', true)
  })

  it('uses recent learner activity instead of the account creation date', async () => {
    mockFindUserProduct.mockResolvedValue(userProductWithoutMetrics())
    mockFindUser.mockResolvedValue({
      _id: 'user-1',
      email: 'student@example.test',
      createdAt: daysAgo(100),
      communicationByCourse: new Map([
        ['OGI_V1', {
          courseSpecificData: { lastReportOpenedAt: daysAgo(2) },
        }],
      ]),
    })

    const result = await decisionEngine.evaluateUserProduct(
      'user-1',
      'product-1',
      true,
    )

    expect(result.tagsToApply).toEqual([])
  })

  it('does not mark a learner inactive when there is no activity signal', async () => {
    mockFindUserProduct.mockResolvedValue(userProductWithoutMetrics())
    mockFindUser.mockResolvedValue({
      _id: 'user-1',
      email: 'student@example.test',
      createdAt: daysAgo(100),
    })

    const result = await decisionEngine.evaluateUserProduct(
      'user-1',
      'product-1',
      true,
    )

    expect(result.tagsToApply).toEqual([])
  })

  it('ignores recent system actions when calculating learner inactivity', async () => {
    mockFindUserProduct.mockResolvedValue(userProductWithoutMetrics())
    mockFindUser.mockResolvedValue({
      _id: 'user-1',
      email: 'student@example.test',
      createdAt: daysAgo(100),
      communicationByCourse: new Map([
        ['OGI_V1', {
          lastTagAppliedAt: daysAgo(1),
          lastEmailSentAt: daysAgo(1),
          courseSpecificData: { lastModuleCompletedAt: daysAgo(15) },
        }],
      ]),
    })

    const result = await decisionEngine.evaluateUserProduct(
      'user-1',
      'product-1',
      true,
    )

    expect(result.tagsToApply).toEqual(['OGI_LEVEL_1'])
  })
})

function userProductWithoutMetrics() {
  return {
    _id: { toString: () => 'user-product-1' },
    activeCampaignData: { tags: [] },
  }
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

function resultForProduct(): DecisionResult {
  return {
    userId: 'student-1',
    productId: 'product-1',
    productCode: 'OGI_V1',
    currentLevel: 0,
    appropriateLevel: 1,
    inCooldown: false,
    decisions: [],
    tagsToApply: ['OGI_LEVEL_1'],
    tagsToRemove: [],
    actionsExecuted: 0,
    errors: [],
  }
}
