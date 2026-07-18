import User from '../../src/models/user'
import UserProduct from '../../src/models/UserProduct'
import {
  calculateStudentStats,
  consolidateClasses,
  consolidateEngagement,
  consolidateProgressByProduct,
} from '../../src/utils/studentDataConsolidator'

describe('consolidateClasses', () => {
  const user = new User({
    email: 'student@example.com',
    name: 'Student',
  })

  it('does not classify Discord classes as CursEduca classes', () => {
    const discordProduct = new UserProduct({
      userId: user._id,
      productId: user._id,
      platform: 'discord',
      platformUserId: 'discord-user',
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
      source: 'MANUAL',
      classes: [
        {
          classId: 'discord-community',
          className: 'Discord Community',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      isPrimary: false,
    })

    expect(consolidateClasses([discordProduct])).toEqual([])
  })

  it('does not expose a role that is absent from class enrollments', () => {
    const hotmartProduct = new UserProduct({
      userId: user._id,
      productId: user._id,
      platform: 'hotmart',
      platformUserId: 'hotmart-user',
      enrolledAt: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
      source: 'PURCHASE',
      classes: [
        {
          classId: 'hotmart-class',
          className: 'Hotmart Class',
          joinedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      isPrimary: true,
    })

    const [consolidatedClass] = consolidateClasses([hotmartProduct])

    expect(consolidatedClass).not.toHaveProperty('role')
  })

  it('accepts the plain data returned by lean queries', () => {
    const metadataCreatedAt = new Date('2026-01-01T00:00:00.000Z')
    const leanUser = {
      metadata: {
        createdAt: metadataCreatedAt,
      },
    }

    expect(consolidateProgressByProduct([])).toEqual([])
    expect(consolidateEngagement([], [])).toEqual(
      expect.objectContaining({
        states: [],
      }),
    )

    const stats = calculateStudentStats(leanUser, [], [], [])

    expect(stats.memberSince).toEqual(metadataCreatedAt)
    expect(Number.isFinite(stats.daysSinceMemberSince)).toBe(true)
  })
})
