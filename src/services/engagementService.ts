// src/services/engagementService.ts
import User, { IUser } from '../models/user'

// (opcional mas recomendado) tipar em vez de any
export const calculateCombinedEngagement = (user: Pick<IUser, 'hotmart' | 'curseduca'> & any): number => {
  const hotmartEng = user.hotmart?.engagement?.engagementScore
  const curseducaEng = user.curseduca?.engagement?.alternativeEngagement
  const legacyEng = user.engagement

  return hotmartEng || curseducaEng || legacyEng || 0
}

export const getEngagementStatsByPlatform = async () => {
  const users = await User.find({ isDeleted: { $ne: true } }).lean()

  const stats = {
    hotmart: { total: 0, sum: 0, avg: 0 },
    curseduca: { total: 0, sum: 0, avg: 0 },
    combined: { total: 0, sum: 0, avg: 0 }
  }

  users.forEach(user => {
    const hotmartEng = user.hotmart?.engagement?.engagementScore
    if (hotmartEng) {
      stats.hotmart.total++
      stats.hotmart.sum += hotmartEng
    }

    // ✅ AQUI: alternativeEngagement
    const curseducaEng = user.curseduca?.engagement?.alternativeEngagement
    if (curseducaEng) {
      stats.curseduca.total++
      stats.curseduca.sum += curseducaEng
    }

    const finalEng = calculateCombinedEngagement(user)
    if (finalEng > 0) {
      stats.combined.total++
      stats.combined.sum += finalEng
    }
  })

  stats.hotmart.avg = stats.hotmart.total > 0 ? stats.hotmart.sum / stats.hotmart.total : 0
  stats.curseduca.avg = stats.curseduca.total > 0 ? stats.curseduca.sum / stats.curseduca.total : 0
  stats.combined.avg = stats.combined.total > 0 ? stats.combined.sum / stats.combined.total : 0

  return stats
}
