import UserProduct, { type IUserProduct } from '../../models/UserProduct'
import type { IUser } from '../../models/user'
import type {
  GuruInactivationReadRecord,
  GuruInactivationReadRepository,
} from './guruInactivationRead.service'

type PopulatedUser = Pick<IUser, '_id' | 'email' | 'name' | 'guru' | 'curseduca'>
type InactivationRow = Pick<
  IUserProduct,
  '_id' | 'platformUserId' | 'classes' | 'metadata'
> & { userId?: PopulatedUser | null }

const toRecord = (row: InactivationRow): GuruInactivationReadRecord => ({
  userProductId: String(row._id),
  userId: row.userId?._id ? String(row.userId._id) : undefined,
  email: row.userId?.email,
  name: row.userId?.name,
  platformUserId: row.platformUserId || undefined,
  fallbackCurseducaUserId: row.userId?.curseduca?.curseducaUserId || undefined,
  guruStatus: row.userId?.guru?.status,
  curseducaStatus: row.userId?.curseduca?.memberStatus,
  markedAt: row.metadata?.markedForInactivationAt,
  markedReason: row.metadata?.markedForInactivationReason,
  inactivatedAt: row.metadata?.inactivatedAt,
  inactivatedBy: row.metadata?.inactivatedBy,
  inactivatedReason: row.metadata?.inactivatedReason,
  classes: row.classes,
})

const pendingQuery = () => UserProduct.find({
  platform: 'curseduca',
  status: 'PARA_INATIVAR',
})

export const mongooseGuruInactivationReadRepository: GuruInactivationReadRepository = {
  async findPending() {
    const rows = await pendingQuery()
      .populate<{ userId: PopulatedUser }>('userId', 'email name guru curseduca')
      .sort({ 'metadata.markedForInactivationAt': -1 })
      .lean()
    return rows.map(toRecord)
  },

  async findPendingForStats() {
    const rows = await pendingQuery()
      .select('platformUserId userId')
      .populate<{ userId: PopulatedUser }>(
        'userId',
        'email guru.status curseduca.curseducaUserId',
      )
      .lean()
    return rows.map(toRecord)
  },

  async findInactive() {
    const rows = await UserProduct.find({
      platform: 'curseduca',
      status: 'INACTIVE',
    })
      .populate<{ userId: PopulatedUser }>('userId', 'email name guru curseduca')
      .sort({ 'metadata.inactivatedAt': -1 })
      .lean()
    return rows.map(toRecord)
  },

  async countInactivatedSince(start) {
    return UserProduct.countDocuments({
      platform: 'curseduca',
      status: 'INACTIVE',
      'metadata.inactivatedAt': { $gte: start },
    })
  },

  async countInactivatedByGuru() {
    return UserProduct.countDocuments({
      platform: 'curseduca',
      status: 'INACTIVE',
      'metadata.inactivatedBy': { $regex: /^guru_integration/ },
    })
  },
}
