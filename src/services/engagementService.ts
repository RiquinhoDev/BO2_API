// src/services/engagementService.ts
import User from '../models/user'

// ✅ ATUALIZAR: Função para calcular engagement considerando ambas as plataformas
export const calculateCombinedEngagement = (user: any): number => {
  // Prioridade: Hotmart > Curseduca > Legacy
  const hotmartEng = user.hotmart?.engagement?.engagementScore
  const curseducaEng = user.curseduca?.engagement?.engagementScore
  const legacyEng = user.engagement

  // ⚠️ IMPORTANTE: NÃO fazer média com Curseduca porque é limitado
  // Usar Hotmart se disponível, senão Curseduca, senão legacy
  return hotmartEng || curseducaEng || legacyEng || 0
}

// ✅ NOVO: Obter stats de engagement por plataforma
export const getEngagementStatsByPlatform = async () => {
  const users = await User.find({ isDeleted: { $ne: true } }).lean()

  const stats = {
    hotmart: { total: 0, sum: 0, avg: 0 },
    curseduca: { total: 0, sum: 0, avg: 0 },
    combined: { total: 0, sum: 0, avg: 0 }
  }

  users.forEach(user => {
    // Hotmart
    const hotmartEng = user.hotmart?.engagement?.engagementScore
    if (hotmartEng) {
      stats.hotmart.total++
      stats.hotmart.sum += hotmartEng
    }

    // Curseduca
    const curseducaEng = user.curseduca?.engagement?.engagementScore
    if (curseducaEng) {
      stats.curseduca.total++
      stats.curseduca.sum += curseducaEng
    }

    // Combined (prioriza Hotmart)
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
