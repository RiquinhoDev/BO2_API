import IdsDiferentes from '../../models/IdsDiferentes'
import UnmatchedUser from '../../models/UnmatchedUser'
import User from '../../models/user'
import type {
  DiscordIdentityReview,
  DiscordIdentityUser,
  UserIdentityReconciliationRepository,
} from './userIdentityReconciliation.service'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function exactCaseInsensitive(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value)}$`, 'i')
}

export class MongooseUserIdentityReconciliationRepository
implements UserIdentityReconciliationRepository {
  async findUserByEmail(email: string): Promise<DiscordIdentityUser | null> {
    const user = await User.findOne({
      email: { $regex: exactCaseInsensitive(email) },
    })
    if (!user) return null

    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      discordIds: user.discord?.discordIds ?? [],
    }
  }

  async replaceDiscordIds(userId: string, discordIds: string[]): Promise<void> {
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          'discord.discordIds': discordIds,
          'discord.lastEditedAt': new Date(),
        },
      },
    )
  }

  async findReviewById(id: string): Promise<DiscordIdentityReview | null> {
    const review = await IdsDiferentes.findById(id)
    if (!review) return null

    return {
      id: review._id.toString(),
      email: review.email,
      newDiscordId: review.newDiscordId,
    }
  }

  async deleteReviewById(id: string): Promise<boolean> {
    return (await IdsDiferentes.findByIdAndDelete(id)) !== null
  }

  async deleteReviewsByIds(ids: string[]): Promise<number> {
    const result = await IdsDiferentes.deleteMany({ _id: { $in: ids } })
    return result.deletedCount
  }

  async deleteUnmatchedById(id: string): Promise<boolean> {
    return (await UnmatchedUser.findByIdAndDelete(id)) !== null
  }

  async deleteUnmatchedMatch(
    discordId: string,
    email: string,
  ): Promise<void> {
    await UnmatchedUser.deleteOne({
      discordId,
      email: { $regex: exactCaseInsensitive(email) },
    })
  }

  async deleteUnmatchedByIds(ids: string[]): Promise<number> {
    const result = await UnmatchedUser.deleteMany({ _id: { $in: ids } })
    return result.deletedCount
  }

  async createUnmatched(discordId: string, email: string): Promise<void> {
    await UnmatchedUser.create({ discordId, email })
  }
}
