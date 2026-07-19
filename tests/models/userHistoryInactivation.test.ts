import mongoose from 'mongoose'
import UserHistory from '../../src/models/UserHistory'

describe('UserHistory inactivation audit', () => {
  it('creates the audit record consumed by the inactivation list and revert flows', async () => {
    const userId = new mongoose.Types.ObjectId()
    const create = jest.spyOn(UserHistory, 'create').mockResolvedValue({} as never)
    const createInactivationHistory = Reflect.get(UserHistory, 'createInactivationHistory')

    expect(typeof createInactivationHistory).toBe('function')

    await createInactivationHistory.call(
      UserHistory,
      userId,
      'student@example.test',
      ['hotmart', 'curseduca'],
      'Class deactivated',
      'admin@example.test',
    )

    expect(create).toHaveBeenCalledWith({
      userId,
      userEmail: 'student@example.test',
      changeType: 'INACTIVATION',
      previousValue: { status: 'ACTIVE' },
      newValue: { status: 'INACTIVE' },
      platform: 'system',
      action: 'update',
      source: 'MANUAL',
      changedBy: 'admin@example.test',
      reason: 'Class deactivated',
      metadata: {
        platforms: ['hotmart', 'curseduca'],
      },
    })
  })
})
