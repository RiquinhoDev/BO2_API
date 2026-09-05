import User, { type IUser } from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { MAX_BULK_OPERATION_ITEMS } from '../../security/bulkOperationPolicy'
import type {
  ExternalInactivationEnrollment,
  GuruExternalInactivationRepository,
} from './guruExternalInactivation.service'

type PopulatedUser = Pick<IUser, '_id' | 'email' | 'curseduca'>
type PopulatedEnrollment = {
  _id: unknown
  userId: PopulatedUser
  platformUserId?: string
  status?: string
}

const toEnrollment = (item: PopulatedEnrollment): ExternalInactivationEnrollment => ({
  id: item._id,
  userId: item.userId?._id,
  email: item.userId?.email,
  memberId: item.platformUserId || item.userId?.curseduca?.curseducaUserId,
  hasCurseducaUser: Boolean(item.userId?.curseduca),
  status: item.status,
})

export const mongooseGuruExternalInactivationRepository: GuruExternalInactivationRepository = {
  async findOne({ userProductId, curseducaUserId }) {
    const query = userProductId
      ? UserProduct.findById(userProductId)
      : UserProduct.findOne({ platform: 'curseduca', platformUserId: curseducaUserId })
    const enrollment = await query
      .populate<{ userId: PopulatedUser }>('userId', 'email curseduca')
      .lean()
    return enrollment ? toEnrollment(enrollment) : undefined
  },

  async findMany({ userProductIds, all }) {
    const filter = all === true
      ? { platform: 'curseduca', status: 'PARA_INATIVAR' }
      : { _id: { $in: userProductIds ?? [] } }
    const query = UserProduct.find(filter)
    if (all === true) query.sort({ _id: 1 }).limit(MAX_BULK_OPERATION_ITEMS + 1)
    const enrollments = await query
      .populate<{ userId: PopulatedUser }>('userId', 'email curseduca')
      .lean()
    return enrollments.map(toEnrollment)
  },

  async markDuplicates(ids, at) {
    await UserProduct.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          status: 'INACTIVE',
          'metadata.inactivatedAt': at,
          'metadata.inactivatedBy': 'bulk_dedup',
        },
      },
    )
  },

  async markInactive(enrollment, at, source, response) {
    const set: Record<string, unknown> = {
      status: 'INACTIVE',
      'metadata.inactivatedAt': at,
      'metadata.inactivatedBy': source,
    }
    if (response !== undefined) set['metadata.curseducaResponse'] = response
    await UserProduct.findByIdAndUpdate(enrollment.id, { $set: set })
    if (enrollment.hasCurseducaUser) {
      await User.findByIdAndUpdate(enrollment.userId, {
        $set: {
          'curseduca.memberStatus': 'INACTIVE',
          'curseduca.inactivatedAt': at,
        },
      })
    }
  },

  async recordFailure(id, at, error) {
    await UserProduct.findByIdAndUpdate(id, {
      $set: {
        'metadata.inactivationError': error,
        'metadata.inactivationAttemptAt': at,
      },
    })
  },
}
