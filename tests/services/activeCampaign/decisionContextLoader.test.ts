import {
  adaptDecisionRule,
  loadDecisionContext,
  type DecisionContextRepositories,
  type PersistedDecisionRule
} from '../../../src/services/activeCampaign/decisionContextLoader'

const objectId = (value: string) => ({ toString: () => value })

function rule(overrides: Partial<PersistedDecisionRule> = {}): PersistedDecisionRule {
  return {
    _id: objectId('rule-1'),
    name: 'Inatividade',
    priority: 7,
    conditions: [],
    actions: { addTag: 'nivel-1' },
    ...overrides
  }
}

describe('adaptDecisionRule', () => {
  it('preserves an existing condition string and persisted metadata', () => {
    const adapted = adaptDecisionRule(rule({ condition: 'engagementScore < 20' }))
    expect(adapted).toEqual(expect.objectContaining({
      name: 'Inatividade',
      tagName: 'nivel-1',
      action: 'APPLY_TAG',
      condition: 'engagementScore < 20',
      priority: 7,
      daysInactive: undefined
    }))
    expect(adapted._id?.toString()).toBe('rule-1')
  })

  it('converts simple and compound conditions with the legacy grammar', () => {
    const adapted = adaptDecisionRule(rule({
      conditions: [
        { type: 'SIMPLE', field: 'daysSinceLastLogin', operator: 'greaterThan', value: 14 },
        {
          type: 'COMPOUND',
          logic: 'OR',
          subConditions: [
            { field: 'engagementScore', operator: 'lessThan', value: 30, unit: 'percentage' },
            { field: 'currentProgress', operator: 'equals', value: 0, unit: 'percentage' }
          ]
        }
      ]
    }))

    expect(adapted.condition).toBe(
      'daysSinceLastLogin >= 14 AND (engagementScore < 30 || currentProgress === 0)'
    )
    expect(adapted.daysInactive).toBe(14)
  })
})

describe('loadDecisionContext', () => {
  it('loads the canonical records and adapts sorted active course rules', async () => {
    const userProduct = { _id: objectId('up-1') }
    const user = { _id: objectId('user-1') }
    const product = { _id: objectId('product-1'), code: 'OGI', courseCode: 'COURSE-OGI' }
    const course = { _id: objectId('course-1') }
    const repositories: DecisionContextRepositories = {
      findUserProduct: jest.fn().mockResolvedValue(userProduct),
      findUser: jest.fn().mockResolvedValue(user),
      findProduct: jest.fn().mockResolvedValue(product),
      findCourseByCode: jest.fn().mockResolvedValue(course),
      findActiveRules: jest.fn().mockResolvedValue([rule({ condition: 'totalLogins >= 2' })])
    }

    const context = await loadDecisionContext('user-1', 'product-1', repositories)

    expect(repositories.findCourseByCode).toHaveBeenCalledWith('COURSE-OGI')
    expect(repositories.findActiveRules).toHaveBeenCalledWith(course._id)
    expect(context.rules).toEqual([
      expect.objectContaining({ name: 'Inatividade', condition: 'totalLogins >= 2' })
    ])
  })

  it('fails with the legacy message when a primary record is absent', async () => {
    const repositories: DecisionContextRepositories = {
      findUserProduct: jest.fn().mockResolvedValue(null),
      findUser: jest.fn().mockResolvedValue({ _id: objectId('user-1') }),
      findProduct: jest.fn().mockResolvedValue({ _id: objectId('product-1'), code: 'OGI' }),
      findCourseByCode: jest.fn(),
      findActiveRules: jest.fn()
    }

    await expect(loadDecisionContext('user-1', 'product-1', repositories)).rejects.toThrow(
      'UserProduct, User ou Product não encontrado'
    )
    expect(repositories.findCourseByCode).not.toHaveBeenCalled()
  })
})
