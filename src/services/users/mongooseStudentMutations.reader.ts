import User from '../../models/user'
import StudentClassHistory from '../../models/StudentClassHistory'
import type { StudentMutationsReader, StudentRecord } from './studentMutations.service'

/**
 * Owns every Mongoose write for the student mutations, moved verbatim from the
 * legacy handler (including recalculateCombinedData). Field shapes and options
 * are preserved so the extraction carries no behavioural change.
 */
export class MongooseStudentMutationsReader implements StudentMutationsReader {
  async findById(id: string): Promise<StudentRecord | null> {
    return User.findById(id) as unknown as Promise<StudentRecord | null>
  }

  async applyUpdate(id: string, fields: Record<string, unknown>): Promise<StudentRecord | null> {
    return User.findByIdAndUpdate(id, fields, {
      new: true,
      runValidators: true,
    }) as unknown as Promise<StudentRecord | null>
  }

  async hardDelete(id: string): Promise<StudentRecord | null> {
    return User.findByIdAndDelete(id) as unknown as Promise<StudentRecord | null>
  }

  async clearClassHistory(id: string): Promise<void> {
    await StudentClassHistory.deleteMany({ studentId: id })
  }

  async block(id: string): Promise<StudentRecord | null> {
    return User.findByIdAndUpdate(
      id,
      { status: 'BLOCKED', estado: 'inativo', updatedAt: new Date() },
      { new: true },
    ) as unknown as Promise<StudentRecord | null>
  }

  async recalculateCombined(userId: string): Promise<void> {
    try {
      const user = await User.findById(userId)
      if (!user) return

      const sourcesAvailable: string[] = []
      if (user.discord?.discordIds?.length) sourcesAvailable.push('discord')
      if (user.hotmart?.hotmartUserId) sourcesAvailable.push('hotmart')
      if (user.curseduca?.curseducaUserId) sourcesAvailable.push('curseduca')

      let status = 'ACTIVE'
      if (user.discord?.isDeleted) status = 'INACTIVE'
      else if (user.curseduca?.memberStatus === 'INACTIVE') status = 'INACTIVE'

      let totalProgress = 0
      let combinedEngagement = 0
      let bestEngagementSource = 'estimated'

      if (user.hotmart?.progress) {
        const totalTimeMinutes = user.hotmart.progress.totalTimeMinutes || 0
        totalProgress = Math.min((totalTimeMinutes / (20 * 60)) * 100, 100)
        combinedEngagement = user.hotmart.engagement?.engagementScore || 0
        bestEngagementSource = 'hotmart'
      } else if (user.curseduca?.progress) {
        totalProgress = user.curseduca.progress.estimatedProgress || 0
        combinedEngagement = user.curseduca.engagement?.alternativeEngagement || 0
        bestEngagementSource = 'curseduca'
      }

      await User.findByIdAndUpdate(userId, {
        combined: {
          status,
          totalProgress: Math.round(totalProgress * 100) / 100,
          combinedEngagement: Math.round(combinedEngagement * 100) / 100,
          bestEngagementSource,
          sourcesAvailable,
          calculatedAt: new Date(),
        },
        'metadata.updatedAt': new Date(),
      })
    } catch {
      // Combined recalculation is best-effort and must not fail the edit.
    }
  }
}
