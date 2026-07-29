export interface DiscordIdentityUser {
  id: string
  email: string
  name?: string
  discordIds: string[]
}

export interface DiscordIdentityReview {
  id: string
  email: string
  newDiscordId: string
}

export interface UserIdentityReconciliationRepository {
  findUserByEmail(email: string): Promise<DiscordIdentityUser | null>
  replaceDiscordIds(userId: string, discordIds: string[]): Promise<void>
  findReviewById(id: string): Promise<DiscordIdentityReview | null>
  deleteReviewById(id: string): Promise<boolean>
  deleteReviewsByIds(ids: string[]): Promise<number>
  deleteUnmatchedById(id: string): Promise<boolean>
  deleteUnmatchedMatch(discordId: string, email: string): Promise<void>
  deleteUnmatchedByIds(ids: string[]): Promise<number>
  createUnmatched(discordId: string, email: string): Promise<void>
}

export interface MergeIdentityInput {
  reviewId?: string
  email: string
  discordId: string
}

export interface ManualMatchInput {
  email: string
  discordId: string
}

export interface BulkMergeResult {
  mergedCount: number
  errors: string[]
}

export type ImportedIdentityResult = 'added' | 'unchanged' | 'unmatched'

interface MergeResult {
  user: DiscordIdentityUser
  changed: boolean
}

function normalizedDiscordIds(discordIds: string[]): string[] {
  return [...new Set(discordIds.map((id) => id.trim()).filter(Boolean))]
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class UserIdentityReconciliationService {
  constructor(
    private readonly repository: UserIdentityReconciliationRepository,
  ) {}

  private async merge(
    input: MergeIdentityInput,
  ): Promise<MergeResult | null> {
    const user = await this.repository.findUserByEmail(input.email)
    if (!user) return null

    const discordIds = normalizedDiscordIds([
      ...user.discordIds,
      input.discordId,
    ])

    const changed = (
      discordIds.length !== user.discordIds.length
      || discordIds.some((id, index) => id !== user.discordIds[index])
    )
    if (changed) {
      await this.repository.replaceDiscordIds(user.id, discordIds)
    }

    if (input.reviewId) {
      await this.repository.deleteReviewById(input.reviewId)
    }

    return {
      user: { ...user, discordIds },
      changed,
    }
  }

  async mergeIdentity(
    input: MergeIdentityInput,
  ): Promise<DiscordIdentityUser | null> {
    return (await this.merge(input))?.user ?? null
  }

  async manualMatch(
    input: ManualMatchInput,
  ): Promise<DiscordIdentityUser | null> {
    const user = await this.mergeIdentity(input)
    if (!user) return null

    await this.repository.deleteUnmatchedMatch(input.discordId, input.email)
    return user
  }

  async reconcileImportedIdentity(
    input: ManualMatchInput,
  ): Promise<ImportedIdentityResult> {
    const result = await this.merge(input)
    if (!result) {
      await this.repository.createUnmatched(input.discordId, input.email)
      return 'unmatched'
    }
    return result.changed ? 'added' : 'unchanged'
  }

  async bulkMerge(reviewIds: string[]): Promise<BulkMergeResult> {
    let mergedCount = 0
    const errors: string[] = []

    for (const reviewId of reviewIds) {
      try {
        const review = await this.repository.findReviewById(reviewId)
        if (!review) continue

        const user = await this.repository.findUserByEmail(review.email)
        if (!user || normalizedDiscordIds(user.discordIds).length > 0) continue

        await this.repository.replaceDiscordIds(
          user.id,
          normalizedDiscordIds([review.newDiscordId]),
        )
        await this.repository.deleteReviewById(reviewId)
        mergedCount += 1
      } catch (error) {
        errors.push(`Erro no ID ${reviewId}: ${errorMessage(error)}`)
      }
    }

    return { mergedCount, errors }
  }

  deleteReview(id: string): Promise<boolean> {
    return this.repository.deleteReviewById(id)
  }

  deleteUnmatched(id: string): Promise<boolean> {
    return this.repository.deleteUnmatchedById(id)
  }

  deleteReviews(ids: string[]): Promise<number> {
    return this.repository.deleteReviewsByIds(ids)
  }

  deleteUnmatchedUsers(ids: string[]): Promise<number> {
    return this.repository.deleteUnmatchedByIds(ids)
  }
}
