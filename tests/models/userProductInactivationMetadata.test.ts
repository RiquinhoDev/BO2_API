import mongoose from 'mongoose'
import UserProduct from '../../src/models/UserProduct'

describe('UserProduct inactivation audit metadata', () => {
  it('persists the lifecycle fields written by the inactivation flows', () => {
    const markedAt = new Date('2026-07-19T10:00:00.000Z')
    const inactivatedAt = new Date('2026-07-19T11:00:00.000Z')
    const metadata = JSON.parse('{}')
    metadata.markedForInactivationAt = markedAt
    metadata.markedForInactivationReason = 'Guru canceled'
    metadata.inactivatedAt = inactivatedAt
    metadata.inactivatedBy = 'guru_integration'
    metadata.inactivatedReason = 'CursEduca access removed'

    const userProduct = new UserProduct({
      userId: new mongoose.Types.ObjectId(),
      productId: new mongoose.Types.ObjectId(),
      platform: 'curseduca',
      platformUserId: 'member-1',
      enrolledAt: markedAt,
      status: 'INACTIVE',
      source: 'PURCHASE',
      classes: [],
      isPrimary: true,
      metadata,
    })

    expect(userProduct.toObject().metadata).toMatchObject(metadata)
  })
})
