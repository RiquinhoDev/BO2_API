import Product from '../../models/product/Product'
import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import { GURU_CANCELED_STATUSES } from './guru.constants'
import type {
  DiscrepancyCandidate,
  GuruDiscrepancyRepository,
  PendingEnrollmentInput,
} from './guruDiscrepancy.service'

export const mongooseGuruDiscrepancyRepository: GuruDiscrepancyRepository = {
  async listCandidates(emails) {
    const users = await User.find({
      guru: { $exists: true },
      'guru.status': { $in: GURU_CANCELED_STATUSES },
      ...(emails && emails.length > 0 ? { email: { $in: emails } } : {}),
    }).select('_id email name guru curseduca').lean()
    if (users.length === 0) return []

    const enrollments = await UserProduct.find({
      userId: { $in: users.map(user => user._id) },
      platform: 'curseduca',
    }).select('_id userId status').lean()
    const enrollmentByUser = new Map(
      enrollments.map(enrollment => [String(enrollment.userId), enrollment]),
    )

    return users.map((user): DiscrepancyCandidate => {
      const enrollment = enrollmentByUser.get(String(user._id))
      return {
        userId: user._id,
        email: user.email,
        name: user.name,
        guruStatus: user.guru?.status,
        curseducaUserId: user.curseduca?.curseducaUserId,
        curseducaSituation: user.curseduca?.situation,
        joinedDate: user.curseduca?.joinedDate,
        enrollment: enrollment
          ? { id: enrollment._id, status: enrollment.status }
          : undefined,
      }
    })
  },

  async findActiveCurseducaProductId() {
    const product = await Product.findOne({
      platform: 'curseduca',
      isActive: true,
    }).select('_id').lean()
    return product?._id
  },

  async saveCurseducaUserId(userId, memberId) {
    await User.findByIdAndUpdate(userId, {
      $set: { 'curseduca.curseducaUserId': memberId },
    })
  },

  async createPendingEnrollment(input: PendingEnrollmentInput) {
    const enrollment = await UserProduct.create({
      userId: input.userId,
      productId: input.productId,
      platform: 'curseduca',
      platformUserId: input.memberId,
      status: 'PARA_INATIVAR',
      enrolledAt: input.enrolledAt,
      metadata: {
        markedForInactivationAt: input.at,
        markedForInactivationReason: input.reason,
        markedFromComparison: true,
      },
    })
    return enrollment._id
  },

  async markPending(enrollmentId, at, reason) {
    await UserProduct.findByIdAndUpdate(enrollmentId, {
      $set: {
        status: 'PARA_INATIVAR',
        'metadata.markedForInactivationAt': at,
        'metadata.markedForInactivationReason': reason,
        'metadata.markedFromComparison': true,
      },
    })
  },
}