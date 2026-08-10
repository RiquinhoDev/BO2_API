import mongoose from 'mongoose'
import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import { snapshotUserState } from '../../src/services/snapshotServices/userSnapshot.service'
import { planClassEnrollmentRole } from '../../src/services/syncUtilizadoresServices/classEnrollmentRole'

describe('snapshot service contracts', () => {
  it('reads engagement from the canonical combined user state', () => {
    const user = new User({
      email: 'student@example.test',
      name: 'Student',
      combined: {
        combinedEngagement: 72,
        engagement: {
          score: 72,
          level: 'ALTO',
          sources: { hotmart: 72 },
        },
      },
    })

    expect(snapshotUserState(user)).toEqual({
      name: 'Student',
      email: 'student@example.test',
      averageEngagement: 72,
      averageEngagementLevel: 'ALTO',
    })
  })

  it('preserves the source role in a strict UserProduct class enrollment', () => {
    const product = new UserProduct({
      userId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      platform: 'curseduca',
      platformUserId: 'member-1',
      enrolledAt: new Date('2026-07-18T00:00:00Z'),
      status: 'ACTIVE',
      source: 'CURSEDUCA_SYNC',
      classes: [{
        classId: 'group-1',
        joinedAt: new Date('2026-07-18T00:00:00Z'),
        role: 'student',
      }],
    })

    expect(product.classes[0].role).toBe('student')
    expect(product.toObject().classes[0]).toMatchObject({ role: 'student' })
  })

  it('plans role persistence for new and changed class enrollments', () => {
    expect(planClassEnrollmentRole([], 'group-1', 'student')).toEqual({
      role: 'student',
    })
    expect(planClassEnrollmentRole([
      {
        classId: 'group-1',
        joinedAt: new Date('2026-07-18T00:00:00Z'),
        role: 'assistant',
      },
    ], 'group-1', 'student')).toEqual({
      role: 'student',
      update: {
        path: 'classes.0.role',
        value: 'student',
      },
    })
    expect(planClassEnrollmentRole([
      {
        classId: 'group-1',
        joinedAt: new Date('2026-07-18T00:00:00Z'),
        role: 'student',
      },
    ], 'group-1', 'student')).toEqual({
      role: 'student',
    })
  })
})
