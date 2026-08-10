import User from '../../models/user'
import type { StudentStatsReader, StudentStatsSource } from './studentStats.contract'

/**
 * Flattens the User document into the projection the stats service expects.
 * The query shape is intentionally identical to the legacy controller so the
 * extraction carries no behavioural change; tightening it is separate work.
 */
export class MongooseStudentStatsReader implements StudentStatsReader {
  async findForStats(id: string): Promise<StudentStatsSource | null> {
    const student = await User.findById(id)
    if (!student) return null

    return {
      email: student.email,
      name: student.name,
      classId: student.classId,
      discordIds: student.discord?.discordIds || [],
      combinedStatus: student.combined?.status,
      totalProgress: student.combined?.totalProgress || 0,
      combinedClassId: student.combined?.classId,
      combinedLastActivity: student.combined?.lastActivity,
      hotmartPurchaseDate: student.hotmart?.purchaseDate,
      hotmartLastAccessDate: student.hotmart?.lastAccessDate,
      curseducaLastAccess: student.curseduca?.lastAccess,
    }
  }
}
