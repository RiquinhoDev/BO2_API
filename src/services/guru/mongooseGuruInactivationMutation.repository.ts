import User from '../../models/user'
import UserProduct from '../../models/UserProduct'
import type {
  DuplicateCleanupMode,
  GuruInactivationMutationRepository,
  GuruMutationUser,
} from './guruInactivationMutation.service'

const toUser = (user: { _id: unknown; email: string }): GuruMutationUser => ({
  id: String(user._id),
  email: user.email,
})

export const mongooseGuruInactivationMutationRepository: GuruInactivationMutationRepository = {
  async findUserByEmail(email) {
    const user = await User.findOne({ email }).select('_id email').lean()
    return user ? toUser(user) : undefined
  },

  async quarantinePending(userId, at) {
    const result = await UserProduct.updateMany(
      { userId, platform: 'curseduca', status: 'PARA_INATIVAR' },
      {
        $set: {
          status: 'QUARENTENA',
          'metadata.quarantinedAt': at,
          'metadata.quarantineReason': 'Duplicado — marcado para revisão manual',
        },
        $unset: {
          'metadata.markedForInactivationAt': 1,
          'metadata.markedForInactivationReason': 1,
        },
      },
    )
    return result.modifiedCount
  },

  async revertMark(userProductId, at) {
    const result = await UserProduct.findByIdAndUpdate(userProductId, {
      $set: {
        status: 'ACTIVE',
        'metadata.revertedAt': at,
        'metadata.revertedBy': 'manual',
      },
      $unset: {
        'metadata.markedForInactivationAt': 1,
        'metadata.markedForInactivationReason': 1,
      },
    }, { new: true })
    return Boolean(result)
  },

  async cleanupDuplicates(userProductIds, mode: DuplicateCleanupMode, at) {
    const result = mode === 'primary'
      ? await UserProduct.updateMany(
        { _id: { $in: userProductIds }, platform: 'curseduca' },
        { $set: { isPrimary: true } },
      )
      : await UserProduct.updateMany(
        { _id: { $in: userProductIds }, platform: 'curseduca', status: 'PARA_INATIVAR' },
        {
          $set: {
            status: 'INACTIVE',
            isPrimary: false,
            'metadata.inactivatedAt': at,
            'metadata.inactivatedBy': 'cleanup_duplicates',
            'metadata.inactivatedReason': 'Duplicado — plano substituído por novo plano (limpeza manual)',
          },
          $unset: {
            'metadata.markedForInactivationAt': 1,
            'metadata.markedForInactivationReason': 1,
          },
        },
      )
    return result.modifiedCount
  },

  async findUserIdsByEmails(emails) {
    const users = await User.find({ email: { $in: emails } }).select('_id').lean()
    return users.map((user) => String(user._id))
  },

  async markProductsStale(userIds, at) {
    const result = await UserProduct.updateMany(
      { userId: { $in: userIds }, platform: 'curseduca', status: 'ACTIVE' },
      {
        $set: {
          status: 'INACTIVE',
          isPrimary: false,
          'metadata.inactivatedAt': at,
          'metadata.inactivatedBy': 'mark_stale_inactive',
          'metadata.inactivatedReason': 'Não encontrado no sync CursEduca — saiu do grupo ou acesso revogado',
        },
      },
    )
    return result.modifiedCount
  },

  async markUsersInactive(userIds) {
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: { 'curseduca.memberStatus': 'INACTIVE', 'curseduca.situation': 'INACTIVE' } },
    )
    return result.modifiedCount
  },

  async restoreProducts(userProductIds, at) {
    const result = await UserProduct.updateMany(
      { _id: { $in: userProductIds }, platform: 'curseduca' },
      {
        $set: {
          status: 'PARA_INATIVAR',
          isPrimary: true,
          'metadata.restoredAt': at,
          'metadata.restoredReason': 'Restaurado manualmente — acidentalmente marcado como INACTIVE',
        },
        $unset: {
          'metadata.inactivatedAt': 1,
          'metadata.inactivatedBy': 1,
          'metadata.inactivatedReason': 1,
        },
      },
    )
    return result.modifiedCount
  },

  async activateUser(email) {
    const user = await User.findOne({ email }).select('_id email').lean()
    if (!user) return undefined
    await User.findByIdAndUpdate(user._id, { $set: { 'curseduca.memberStatus': 'ACTIVE' } })
    return toUser(user)
  },

  async findCurseducaProductId(userId) {
    const userProduct = await UserProduct.findOne({ userId, platform: 'curseduca' })
      .select('_id')
      .lean()
    return userProduct ? String(userProduct._id) : undefined
  },

  async activateProduct(userProductId, at) {
    await UserProduct.findByIdAndUpdate(userProductId, {
      $set: {
        status: 'ACTIVE',
        'metadata.fixedToActiveAt': at,
        'metadata.fixedToActiveReason': 'Correção manual: Guru e Clareza confirmados como ACTIVE',
      },
      $unset: {
        'metadata.markedForInactivationAt': 1,
        'metadata.markedForInactivationReason': 1,
        'metadata.inactivatedAt': 1,
        'metadata.inactivatedBy': 1,
        'metadata.inactivatedReason': 1,
      },
    })
  },
}
