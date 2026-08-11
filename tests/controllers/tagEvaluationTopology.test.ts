import { evaluateTags, evaluateTagsBatch } from '../../src/controllers/tagEvaluation.controller'
import { calculateTagDiff, mapUserToEvaluation } from '../../src/services/tagEvaluation/mapping'

describe('tag evaluation controller topology', () => {
  it('keeps document mapping separate from HTTP orchestration', () => {
    expect(typeof mapUserToEvaluation).toBe('function')
    expect(calculateTagDiff(['A'], ['A', 'B'])).toEqual({
      currentTags: ['A'],
      newTags: ['A', 'B'],
      tagsToAdd: ['B'],
      tagsToRemove: [],
      unchanged: ['A']
    })
    expect(typeof evaluateTags).toBe('function')
    expect(typeof evaluateTagsBatch).toBe('function')
  })
})
