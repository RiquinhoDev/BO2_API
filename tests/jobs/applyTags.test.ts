import { Types } from 'mongoose'
import { addTagsInBatches } from '../../src/services/activeCampaign/tagBatch'

function tagResponse(tag: string) {
  return {
    contactTag: {
      id: `contact-tag-${tag}`,
      contact: 'contact-1',
      tag,
      cdate: '2026-07-18T00:00:00Z',
    },
  }
}

const mockUserLean = jest.fn()
const mockProductLean = jest.fn()
const mockUserProductLean = jest.fn()
const mockUpdateMany = jest.fn()
const mockEvaluateStudentTags = jest.fn()
const mockRemoveTagBatch = jest.fn()
const mockAddTag = jest.fn(
  async (_email: string, tag: string) => tagResponse(tag),
)
const mockAddTagsBatch = jest.fn(
  (email: string, tags: string[], batchSize?: number) =>
    addTagsInBatches(email, tags, mockAddTag, batchSize),
)

jest.mock('../../src/models', () => ({
  User: {
    find: jest.fn(() => ({ lean: mockUserLean })),
  },
  Product: {
    find: jest.fn(() => ({ lean: mockProductLean })),
  },
  UserProduct: {
    find: jest.fn(() => ({ lean: mockUserProductLean })),
    updateMany: mockUpdateMany,
  },
}))

jest.mock(
  '../../src/jobs/dailyPipeline/tagEvaluation/evaluateStudentTags',
  () => ({
    evaluateStudentTags: mockEvaluateStudentTags,
    getTagsToAdd: (current: string[], next: string[]) =>
      next.filter(tag => !current.includes(tag)),
    getTagsToRemove: (current: string[], next: string[]) =>
      current.filter(tag => !next.includes(tag)),
  }),
)

jest.mock(
  '../../src/services/activeCampaign/activeCampaignService',
  () => ({
    activeCampaignService: {
      addTag: mockAddTag,
      addTagsBatch: mockAddTagsBatch,
      removeTagBatch: mockRemoveTagBatch,
    },
  }),
)

import { evaluateAndApplyTags } from '../../src/jobs/dailyPipeline/tagEvaluation/applyTags'

function arrangeOneTagToAdd() {
  const userId = new Types.ObjectId()
  const productId = new Types.ObjectId()

  mockUserLean.mockResolvedValue([
    {
      _id: userId,
      email: 'student@example.test',
    },
  ])
  mockProductLean.mockResolvedValue([
    {
      _id: productId,
      name: 'OGI',
    },
  ])
  mockUserProductLean.mockResolvedValue([
    {
      _id: new Types.ObjectId(),
      userId,
      productId,
      status: 'ACTIVE',
      activeCampaignData: { tags: [] },
    },
  ])
  mockUpdateMany.mockResolvedValue({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1,
    upsertedCount: 0,
    upsertedId: null,
  })
  mockEvaluateStudentTags.mockResolvedValue({
    userId,
    email: 'student@example.test',
    tags: ['BO_NEW_TAG'],
    appliedTags: [],
  })
}

describe('ActiveCampaign tag application safety', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.AC_TAG_APPLY_ENABLED
  })

  afterEach(() => {
    jest.useRealTimers()
    delete process.env.AC_TAG_APPLY_ENABLED
  })

  test('batches additions and classifies ACTagResponse results', async () => {
    jest.useFakeTimers()
    const addTag = jest.fn(
      async (_email: string, tag: string) => {
        const response = tagResponse(tag)
        if (tag === 'tag-2') {
          response.contactTag.id = ''
        }
        return response
      },
    )

    const resultPromise = addTagsInBatches(
      'student@example.test',
      ['tag-1', 'tag-2', 'tag-3', 'tag-4'],
      addTag,
    )

    await jest.advanceTimersByTimeAsync(2_000)

    await expect(resultPromise).resolves.toEqual({
      success: ['tag-1', 'tag-3', 'tag-4'],
      failed: ['tag-2'],
      total: 4,
    })
    expect(addTag.mock.calls).toEqual([
      ['student@example.test', 'tag-1'],
      ['student@example.test', 'tag-2'],
      ['student@example.test', 'tag-3'],
      ['student@example.test', 'tag-4'],
    ])
  })

  test('default-off flag skips additions without inflating errors', async () => {
    arrangeOneTagToAdd()

    const result = await evaluateAndApplyTags()

    expect(mockAddTagsBatch).not.toHaveBeenCalled()
    expect(mockAddTag).not.toHaveBeenCalled()
    expect(result.stats.tagsApplied).toBe(0)
    expect(result.stats.errors).toBe(0)
  })

  test('enabled flag applies additions through addTag', async () => {
    process.env.AC_TAG_APPLY_ENABLED = 'true'
    arrangeOneTagToAdd()

    const result = await evaluateAndApplyTags()

    expect(mockAddTagsBatch).toHaveBeenCalledWith(
      'student@example.test',
      ['BO_NEW_TAG'],
    )
    expect(mockAddTag).toHaveBeenCalledWith(
      'student@example.test',
      'BO_NEW_TAG',
    )
    expect(result.stats.tagsApplied).toBe(1)
    expect(result.stats.errors).toBe(0)
  })
})
