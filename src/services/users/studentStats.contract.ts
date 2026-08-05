/**
 * Ports for the student stats read. The reader owns every Mongoose detail; the
 * service stays pure so the derivation rules can be proven without a database.
 */

export interface Clock {
  now(): Date
}

/** Projection the reader must supply, already flattened from the User document. */
export interface StudentStatsSource {
  email?: string
  name?: string
  classId?: string
  discordIds: string[]
  combinedStatus?: string
  totalProgress: number
  combinedClassId?: string
  combinedLastActivity?: Date
  hotmartPurchaseDate?: Date
  hotmartLastAccessDate?: Date
  curseducaLastAccess?: Date
}

export interface StudentStatsReader {
  findForStats(id: string): Promise<StudentStatsSource | null>
}

export interface StudentValidationStatus {
  email: boolean
  discordIds: boolean
  name: boolean
}

/** Exact legacy response body of GET /api/users/:id/stats. */
export interface StudentStatsResult {
  hasEmail: boolean
  hasName: boolean
  hasDiscordIds: boolean
  totalDiscordIds: number
  isActive: boolean
  hasProgress: boolean
  progressPercentage: number
  hasPurchaseDate: boolean
  hasLastAccess: boolean
  daysSincePurchase: number | null
  daysSinceLastAccess: number | null
  hasClass: boolean
  classId?: string
  validationStatus: StudentValidationStatus
}
