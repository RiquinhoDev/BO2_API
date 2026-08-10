import {
  type DiscordIdentityReview,
  type DiscordIdentityUser,
  type UserIdentityReconciliationRepository,
  UserIdentityReconciliationService,
} from '../../../src/services/users/userIdentityReconciliation.service'

class InMemoryIdentityRepository implements UserIdentityReconciliationRepository {
  readonly users = new Map<string, DiscordIdentityUser>()
  readonly reviews = new Map<string, DiscordIdentityReview>()
  readonly unmatched = new Map<string, { discordId: string; email: string }>()

  async findUserByEmail(email: string): Promise<DiscordIdentityUser | null> {
    const normalized = email.toLowerCase()
    return [...this.users.values()]
      .find((user) => user.email.toLowerCase() === normalized) ?? null
  }

  async replaceDiscordIds(userId: string, discordIds: string[]): Promise<void> {
    const user = this.users.get(userId)
    if (!user) throw new Error(`missing user ${userId}`)
    this.users.set(userId, { ...user, discordIds: [...discordIds] })
  }

  async findReviewById(id: string): Promise<DiscordIdentityReview | null> {
    return this.reviews.get(id) ?? null
  }

  async deleteReviewById(id: string): Promise<boolean> {
    return this.reviews.delete(id)
  }

  async deleteReviewsByIds(ids: string[]): Promise<number> {
    return ids.reduce(
      (deleted, id) => deleted + Number(this.reviews.delete(id)),
      0,
    )
  }

  async deleteUnmatchedById(id: string): Promise<boolean> {
    return this.unmatched.delete(id)
  }

  async deleteUnmatchedMatch(discordId: string, email: string): Promise<void> {
    for (const [id, record] of this.unmatched) {
      if (
        record.discordId === discordId
        && record.email.toLowerCase() === email.toLowerCase()
      ) {
        this.unmatched.delete(id)
      }
    }
  }

  async deleteUnmatchedByIds(ids: string[]): Promise<number> {
    return ids.reduce(
      (deleted, id) => deleted + Number(this.unmatched.delete(id)),
      0,
    )
  }

  async createUnmatched(discordId: string, email: string): Promise<void> {
    this.unmatched.set(`unmatched-${this.unmatched.size + 1}`, {
      discordId,
      email,
    })
  }
}

test('merge normalizes existing Discord IDs and consumes its review', async () => {
  const repository = new InMemoryIdentityRepository()
  repository.users.set('user-1', {
    id: 'user-1',
    email: 'student@example.test',
    name: 'Student',
    discordIds: ['', 'existing-id', 'existing-id'],
  })
  repository.reviews.set('review-1', {
    id: 'review-1',
    email: 'student@example.test',
    newDiscordId: 'new-id',
  })
  const service = new UserIdentityReconciliationService(repository)

  const result = await service.mergeIdentity({
    reviewId: 'review-1',
    email: 'STUDENT@example.test',
    discordId: 'new-id',
  })

  expect(result).toEqual({
    id: 'user-1',
    email: 'student@example.test',
    name: 'Student',
    discordIds: ['existing-id', 'new-id'],
  })
  expect(repository.users.get('user-1')?.discordIds).toEqual([
    'existing-id',
    'new-id',
  ])
  expect(repository.reviews.has('review-1')).toBe(false)
})

test('manual match leaves the unmatched record when no user exists', async () => {
  const repository = new InMemoryIdentityRepository()
  repository.unmatched.set('unmatched-1', {
    discordId: 'discord-1',
    email: 'missing@example.test',
  })
  const service = new UserIdentityReconciliationService(repository)

  const result = await service.manualMatch({
    discordId: 'discord-1',
    email: 'missing@example.test',
  })

  expect(result).toBeNull()
  expect(repository.unmatched.has('unmatched-1')).toBe(true)
})

test('bulk merge only consumes reviews for users without a Discord identity', async () => {
  const repository = new InMemoryIdentityRepository()
  repository.users.set('empty-user', {
    id: 'empty-user',
    email: 'empty@example.test',
    discordIds: [''],
  })
  repository.users.set('known-user', {
    id: 'known-user',
    email: 'known@example.test',
    discordIds: ['known-id'],
  })
  repository.reviews.set('mergeable', {
    id: 'mergeable',
    email: 'empty@example.test',
    newDiscordId: 'new-id',
  })
  repository.reviews.set('preserved', {
    id: 'preserved',
    email: 'known@example.test',
    newDiscordId: 'other-id',
  })
  const service = new UserIdentityReconciliationService(repository)

  const result = await service.bulkMerge(['mergeable', 'preserved', 'missing'])

  expect(result).toEqual({ mergedCount: 1, errors: [] })
  expect(repository.users.get('empty-user')?.discordIds).toEqual(['new-id'])
  expect(repository.users.get('known-user')?.discordIds).toEqual(['known-id'])
  expect(repository.reviews.has('mergeable')).toBe(false)
  expect(repository.reviews.has('preserved')).toBe(true)
})

test('import reconciliation records an unmatched identity instead of guessing a user', async () => {
  const repository = new InMemoryIdentityRepository()
  const service = new UserIdentityReconciliationService(repository)

  const result = await service.reconcileImportedIdentity({
    discordId: 'discord-1',
    email: 'missing@example.test',
  })

  expect(result).toBe('unmatched')
  expect([...repository.unmatched.values()]).toEqual([
    {
      discordId: 'discord-1',
      email: 'missing@example.test',
    },
  ])
})
