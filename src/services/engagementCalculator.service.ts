// ═══════════════════════════════════════════════════════════════════════════
// 📊 SERVICE: Engagement Calculator Unificado (Escalável)
// ═══════════════════════════════════════════════════════════════════════════
// 
// OBJETIVO: Calcular engagement MÉDIO de um aluno considerando TODOS os produtos
// 
// FUNCIONA COM:
// - Hotmart (score 0-100)
// - CursEduca (score 0-100 ou outro formato)
// - Discord (score complexo: messages + voice + presence)
// - Qualquer futura plataforma
// 
// ESCALÁVEL: Adicionar nova plataforma = adicionar função de normalização
// ═══════════════════════════════════════════════════════════════════════════

import UserProduct from '../models/UserProduct'

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface NormalizedEngagement {
  platform: string
  originalScore: any
  normalizedScore: number  // 0-100
  weight: number           // Para ponderação futura
}

export interface AverageEngagementResult {
  userId: string
  averageScore: number     // 0-100
  level: EngagementLevel
  breakdown: NormalizedEngagement[]
  totalPlatforms: number
}

export type EngagementLevel = 'MUITO_BAIXO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'MUITO_ALTO'

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZADORES POR PLATAFORMA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 🔥 HOTMART: Já vem em escala 0-100
 */
function normalizeHotmartEngagement(engagement: any): number {
  if (!engagement) return 0
  
  const score = engagement.engagementScore || 0
  
  // Já está normalizado!
  return Math.min(100, Math.max(0, score))
}

/**
 * 📚 CURSEDUCA: Depende do formato que vier da API
 */
function normalizeCurseducaEngagement(engagement: any): number {
  if (!engagement) return 0
  
  // OPÇÃO 1: Se vier score 0-100
  if (engagement.engagementScore !== undefined) {
    return Math.min(100, Math.max(0, engagement.engagementScore))
  }
  
  // OPÇÃO 2: Se vier alternativeEngagement 0-100
  if (engagement.alternativeEngagement !== undefined) {
    return Math.min(100, Math.max(0, engagement.alternativeEngagement))
  }
  
  // OPÇÃO 3: Se vier activityLevel (LOW/MEDIUM/HIGH)
  if (engagement.activityLevel) {
    const level = engagement.activityLevel.toUpperCase()
    if (level === 'HIGH') return 75
    if (level === 'MEDIUM') return 45
    if (level === 'LOW') return 15
  }
  
  return 0
}

/**
 * 💬 DISCORD: Score complexo (messages + voice + presence)
 * 
 * NORMALIZAÇÃO:
 * - Discord score pode ir até 200+ (sem limite superior claro)
 * - Vamos mapear usando percentis ou threshold
 * 
 * ESTRATÉGIA: Usar thresholds baseados em observação
 * - 0-10: Muito Baixo (0-15 normalizado)
 * - 10-50: Baixo (15-35)
 * - 50-100: Médio (35-60)
 * - 100-150: Alto (60-80)
 * - 150+: Muito Alto (80-100)
 */
function normalizeDiscordEngagement(engagement: any): number {
  if (!engagement) return 0
  
  const score = engagement.engagementScore || 0
  
  // Mapear escala aberta → 0-100
  if (score <= 10) {
    // 0-10 → 0-15
    return (score / 10) * 15
  } else if (score <= 50) {
    // 10-50 → 15-35
    return 15 + ((score - 10) / 40) * 20
  } else if (score <= 100) {
    // 50-100 → 35-60
    return 35 + ((score - 50) / 50) * 25
  } else if (score <= 150) {
    // 100-150 → 60-80
    return 60 + ((score - 100) / 50) * 20
  } else {
    // 150+ → 80-100 (cap em 100)
    return Math.min(100, 80 + ((score - 150) / 50) * 20)
  }
}

/**
 * 🌟 FUNÇÃO GENÉRICA: Adicionar novas plataformas aqui
 */
function normalizePlatformEngagement(platform: string, engagement: any): number {
  switch (platform.toLowerCase()) {
    case 'hotmart':
      return normalizeHotmartEngagement(engagement)
    
    case 'curseduca':
      return normalizeCurseducaEngagement(engagement)
    
    case 'discord':
      return normalizeDiscordEngagement(engagement)
    
    // 🆕 ADICIONAR NOVAS PLATAFORMAS AQUI:
    // case 'shopify':
    //   return normalizeShopifyEngagement(engagement)
    
    default:
      console.warn(`⚠️ Plataforma desconhecida: ${platform}`)
      return 0
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÕES PRINCIPAIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 📊 Calcular engagement MÉDIO de um aluno
 * @param userId - ID do user
 * @returns Engagement médio normalizado (0-100)
 */
export async function calculateUserAverageEngagement(
  userId: string
): Promise<AverageEngagementResult> {
  
  // 1. Buscar TODOS os produtos ATIVOS do user
  const userProducts = await UserProduct.find({ 
    userId,
    status: 'ACTIVE' 
  }).lean()
  
  if (userProducts.length === 0) {
    return {
      userId,
      averageScore: 0,
      level: 'MUITO_BAIXO',
      breakdown: [],
      totalPlatforms: 0
    }
  }
  
  // 2. Normalizar engagement de cada produto
  const normalized: NormalizedEngagement[] = []
  
  for (const up of userProducts) {
    const normalizedScore = normalizePlatformEngagement(
      up.platform, 
      up.engagement
    )
    
    // Só considera se tiver engagement > 0
    if (normalizedScore > 0) {
      normalized.push({
        platform: up.platform,
        originalScore: up.engagement,
        normalizedScore,
        weight: 1.0  // Todas plataformas com peso igual (pode ajustar!)
      })
    }
  }
  
  // 3. Calcular MÉDIA PONDERADA
  if (normalized.length === 0) {
    return {
      userId,
      averageScore: 0,
      level: 'MUITO_BAIXO',
      breakdown: [],
      totalPlatforms: userProducts.length
    }
  }
  
  const totalWeight = normalized.reduce((sum, n) => sum + n.weight, 0)
  const weightedSum = normalized.reduce(
    (sum, n) => sum + (n.normalizedScore * n.weight), 
    0
  )
  
  const averageScore = Math.round(weightedSum / totalWeight)
  
  // 4. Determinar LEVEL
  const level = getEngagementLevel(averageScore)
  
  return {
    userId,
    averageScore,
    level,
    breakdown: normalized,
    totalPlatforms: userProducts.length
  }
}

/**
 * 📊 Calcular engagement em BATCH (para performance)
 */
export async function calculateBatchAverageEngagement(
  userIds: string[]
): Promise<Map<string, AverageEngagementResult>> {
  
  const results = new Map<string, AverageEngagementResult>()
  
  // Buscar TODOS os UserProducts de uma vez
  const userProducts = await UserProduct.find({
    userId: { $in: userIds },
    status: 'ACTIVE'
  }).lean()
  
  // Agrupar por userId
  const byUser = new Map<string, any[]>()
  
  userProducts.forEach(up => {
    const userId = up.userId.toString()
    if (!byUser.has(userId)) {
      byUser.set(userId, [])
    }
    byUser.get(userId)!.push(up)
  })
  
  // Calcular para cada user
  for (const [userId, products] of byUser.entries()) {
    const normalized: NormalizedEngagement[] = []
    
    for (const up of products) {
      const normalizedScore = normalizePlatformEngagement(
        up.platform, 
        up.engagement
      )
      
      if (normalizedScore > 0) {
        normalized.push({
          platform: up.platform,
          originalScore: up.engagement,
          normalizedScore,
          weight: 1.0
        })
      }
    }
    
    let averageScore = 0
    
    if (normalized.length > 0) {
      const totalWeight = normalized.reduce((sum, n) => sum + n.weight, 0)
      const weightedSum = normalized.reduce(
        (sum, n) => sum + (n.normalizedScore * n.weight), 
        0
      )
      averageScore = Math.round(weightedSum / totalWeight)
    }
    
    results.set(userId, {
      userId,
      averageScore,
      level: getEngagementLevel(averageScore),
      breakdown: normalized,
      totalPlatforms: products.length
    })
  }
  
  // Adicionar users sem produtos
  for (const userId of userIds) {
    if (!results.has(userId)) {
      results.set(userId, {
        userId,
        averageScore: 0,
        level: 'MUITO_BAIXO',
        breakdown: [],
        totalPlatforms: 0
      })
    }
  }
  
  return results
}

/**
 * 📊 Determinar level baseado em score
 */
export function getEngagementLevel(score: number): EngagementLevel {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 25) return 'BAIXO'
  return 'MUITO_BAIXO'
}

/**
 * 🎨 Obter cor do level (para UI)
 */
export function getEngagementColor(level: EngagementLevel): string {
  switch (level) {
    case 'MUITO_ALTO': return 'bg-green-100 text-green-800'
    case 'ALTO': return 'bg-blue-100 text-blue-800'
    case 'MEDIO': return 'bg-yellow-100 text-yellow-800'
    case 'BAIXO': return 'bg-orange-100 text-orange-800'
    case 'MUITO_BAIXO': return 'bg-red-100 text-red-800'
  }
}