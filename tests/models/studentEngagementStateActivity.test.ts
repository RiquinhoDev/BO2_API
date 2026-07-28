import mongoose from 'mongoose'
import StudentEngagementState from '../../src/models/StudentEngagementState'

describe('StudentEngagementState learner activity', () => {
  it('keeps days since last login unknown until there is a learner activity signal', () => {
    const state = new StudentEngagementState({
      userId: new mongoose.Types.ObjectId(),
      productCode: 'OGI',
      currentState: 'ACTIVE',
      stats: {
        totalDaysInactive: 0,
        currentStreakInactive: 0,
        longestStreakInactive: 0,
      },
    })

    expect(state.daysSinceLastLogin).toBeUndefined()
  })
})
