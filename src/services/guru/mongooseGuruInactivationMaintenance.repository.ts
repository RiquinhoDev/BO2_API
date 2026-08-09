import User, { type IUser } from '../../models/user'
import UserProduct, { type IUserProduct } from '../../models/UserProduct'
import type {
  DiagnosticRecord,
  GuruInactivationMaintenanceRepository,
  PendingInactivationRecord,
} from './guruInactivationMaintenance.service'

type MaintenanceUser = Pick<IUser, '_id' | 'email' | 'name' | 'guru' | 'curseduca'>
type PendingDocument = Pick<IUserProduct, '_id' | 'platformUserId'> & {
  userId?: MaintenanceUser | null
}

const pendingRecord = (item: PendingDocument): PendingInactivationRecord => ({
  id: item._id,
  userId: item.userId?._id,
  email: item.userId?.email,
  name: item.userId?.name,
  guruStatus: item.userId?.guru?.status,
  guruUpdatedAt: item.userId?.guru?.updatedAt,
  guruNextCycleAt: item.userId?.guru?.nextCycleAt,
  curseducaStatus: item.userId?.curseduca?.memberStatus
    ?? item.userId?.curseduca?.situation,
  memberId: item.platformUserId ?? item.userId?.curseduca?.curseducaUserId,
})

export const mongooseGuruInactivationMaintenanceRepository: GuruInactivationMaintenanceRepository = {
  async listPending() {
    const documents = await UserProduct.find({
      platform: 'curseduca',
      status: 'PARA_INATIVAR',
    }).populate<{ userId: MaintenanceUser | null }>(
      'userId',
      'email name curseduca guru',
    ).lean()
    return documents.map(pendingRecord)
  },

  async markInactive(id, at, by, reason) {
    await UserProduct.findByIdAndUpdate(id, {
      $set: {
        status: 'INACTIVE',
        'metadata.inactivatedAt': at,
        'metadata.inactivatedBy': by,
        'metadata.inactivatedReason': reason,
      },
      $unset: {
        'metadata.markedForInactivationAt': 1,
        'metadata.markedForInactivationReason': 1,
      },
    })
  },

  async markActive(id, at, reason) {
    await UserProduct.findByIdAndUpdate(id, {
      $set: {
        status: 'ACTIVE',
        'metadata.revertedAt': at,
        'metadata.revertedBy': 'cleanup_auto',
        'metadata.revertReason': reason,
      },
      $unset: {
        'metadata.markedForInactivationAt': 1,
        'metadata.markedForInactivationReason': 1,
      },
    })
  },

  async updateUserSituation(userId, situation) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        'curseduca.memberStatus': situation,
        'curseduca.situation': situation,
      },
    })
  },

  async findDiagnostic(email): Promise<DiagnosticRecord | undefined> {
    const user = await User.findOne({ email })
      .select('email name guru curseduca')
      .lean()
    if (!user) return undefined
    const product = await UserProduct.findOne({
      userId: user._id,
      platform: 'curseduca',
    }).lean()
    return {
      userId: user._id,
      email,
      name: user.name,
      guruStatus: user.guru?.status,
      guruSubscriptionCode: user.guru?.subscriptionCode,
      curseducaMemberStatus: user.curseduca?.memberStatus,
      curseducaUserId: user.curseduca?.curseducaUserId,
      curseducaSituation: user.curseduca?.situation,
      product: product ? {
        status: product.status,
        platformUserId: product.platformUserId,
        metadata: product.metadata,
        classes: product.classes?.length ?? 0,
      } : null,
    }
  },
}