export type DuplicateCleanupMode = 'primary' | 'inactive'

export interface GuruMutationUser {
  id: string
  email: string
}

export interface GuruInactivationMutationRepository {
  findUserByEmail(email: string): Promise<GuruMutationUser | undefined>
  quarantinePending(userId: string, at: Date): Promise<number>
  revertMark(userProductId: string, at: Date): Promise<boolean>
  cleanupDuplicates(
    userProductIds: string[],
    mode: DuplicateCleanupMode,
    at: Date,
  ): Promise<number>
  findUserIdsByEmails(emails: string[]): Promise<string[]>
  markProductsStale(userIds: string[], at: Date): Promise<number>
  markUsersInactive(userIds: string[]): Promise<number>
  restoreProducts(userProductIds: string[], at: Date): Promise<number>
  activateUser(email: string): Promise<GuruMutationUser | undefined>
  findCurseducaProductId(userId: string): Promise<string | undefined>
  activateProduct(userProductId: string, at: Date): Promise<void>
}

export interface GuruInactivationMutationServiceOptions {
  now?: () => Date
}

export interface FixActiveResult {
  email: string
  success: boolean
  reason?: string
  userUpdated?: boolean
  userProductUpdated?: boolean
}

export type QuarantineResult =
  | { kind: 'not-found' }
  | { kind: 'success'; email: string; modifiedCount: number }

export type RevertResult = { kind: 'not-found' | 'success' }

const normalizeEmail = (email: string): string => email.trim().toLowerCase()

export const createGuruInactivationMutationService = (
  repository: GuruInactivationMutationRepository,
  options: GuruInactivationMutationServiceOptions = {},
) => {
  const now = options.now ?? (() => new Date())

  return {
    async quarantine(email: string): Promise<QuarantineResult> {
      const normalizedEmail = normalizeEmail(email)
      const user = await repository.findUserByEmail(normalizedEmail)
      if (!user) return { kind: 'not-found' }
      return {
        kind: 'success',
        email: user.email,
        modifiedCount: await repository.quarantinePending(user.id, now()),
      }
    },

    async revert(userProductId: string): Promise<RevertResult> {
      const found = await repository.revertMark(userProductId, now())
      return { kind: found ? 'success' : 'not-found' }
    },

    async cleanupDuplicates(userProductIds: string[], setPrimary: boolean) {
      const mode: DuplicateCleanupMode = setPrimary ? 'primary' : 'inactive'
      return {
        modifiedCount: await repository.cleanupDuplicates(
          userProductIds,
          mode,
          now(),
        ),
        requestedCount: userProductIds.length,
        mode,
      }
    },

    async markStale(emails: string[]) {
      const normalizedEmails = emails.map(normalizeEmail)
      const userIds = await repository.findUserIdsByEmails(normalizedEmails)
      if (userIds.length === 0) {
        return {
          emailsRequested: normalizedEmails.length,
          usersFound: 0,
          userProductsModified: 0,
          usersModified: 0,
        }
      }
      const userProductsModified = await repository.markProductsStale(
        userIds,
        now(),
      )
      const usersModified = await repository.markUsersInactive(userIds)
      return {
        emailsRequested: normalizedEmails.length,
        usersFound: userIds.length,
        userProductsModified,
        usersModified,
      }
    },

    async restore(userProductIds: string[]) {
      return {
        modifiedCount: await repository.restoreProducts(userProductIds, now()),
        requestedCount: userProductIds.length,
      }
    },

    async fixActive(emails: string[]) {
      const results: FixActiveResult[] = []
      let updatedUsers = 0
      let updatedUserProducts = 0

      for (const email of emails) {
        const user = await repository.activateUser(email)
        if (!user) {
          results.push({ email, success: false, reason: 'User não encontrado' })
          continue
        }

        updatedUsers += 1
        const userProductId = await repository.findCurseducaProductId(user.id)
        if (userProductId) {
          await repository.activateProduct(userProductId, now())
          updatedUserProducts += 1
        }
        results.push({
          email,
          success: true,
          userUpdated: true,
          userProductUpdated: Boolean(userProductId),
        })
      }

      return { updatedUsers, updatedUserProducts, results }
    },
  }
}

export type GuruInactivationMutationService = ReturnType<
  typeof createGuruInactivationMutationService
>
