// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/engagementScore.ts
// Cálculo do Engagement Score (0-100)
// ════════════════════════════════════════════════════════════

import { IUserProductForEvaluation, ProductName } from './types'

/**
 * Calcula o Engagement Score de um aluno (0-100)
 *
 * Fórmula:
 * - Frequência de acesso: 0-40 pontos
 * - Progresso no curso: 0-30 pontos
 * - Consistência (logins regulares): 0-30 pontos
 *
 * @param userProduct - UserProduct com dados de engagement e progress
 * @param productName - Nome do produto (OGI_V1, CLAREZA_ANUAL, etc.)
 * @returns Engagement score de 0 a 100
 */
export function calculateEngagementScore(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): number {
  let score = 0

  // ─────────────────────────────────────────────────────────────
  // 1️⃣ FREQUÊNCIA DE ACESSO (0-40 pontos)
  // ─────────────────────────────────────────────────────────────
  const daysInactive = userProduct.engagement?.daysInactive ?? 999

  if (daysInactive === 0) {
    score += 40 // Acesso hoje
  } else if (daysInactive <= 3) {
    score += 30 // Últimos 3 dias
  } else if (daysInactive <= 7) {
    score += 20 // Última semana
  } else if (daysInactive <= 14) {
    score += 10 // Últimas 2 semanas
  }
  // Se > 14 dias, 0 pontos

  // ─────────────────────────────────────────────────────────────
  // 2️⃣ PROGRESSO NO CURSO (0-30 pontos)
  // ─────────────────────────────────────────────────────────────
  const progress = userProduct.progress?.percentage ?? 0
  const progressPoints = (progress / 100) * 30
  score += Math.round(progressPoints)

  // ─────────────────────────────────────────────────────────────
  // 3️⃣ CONSISTÊNCIA - Logins nos últimos 30 dias (0-30 pontos)
  // ─────────────────────────────────────────────────────────────
  const logins30d = userProduct.engagement?.loginsLast30Days ?? 0

  if (logins30d >= 20) {
    score += 30 // Muito consistente (quase diário)
  } else if (logins30d >= 10) {
    score += 20 // Consistente (2-3x por semana)
  } else if (logins30d >= 5) {
    score += 10 // Esporádico (1x por semana)
  }
  // Se < 5 logins, 0 pontos

  // ─────────────────────────────────────────────────────────────
  // NORMALIZAÇÃO
  // ─────────────────────────────────────────────────────────────
  return Math.min(100, Math.max(0, Math.round(score)))
}

/**
 * Calcula o nível de engagement baseado no score
 *
 * @param score - Engagement score (0-100)
 * @returns Nível descritivo do engagement
 */
export function getEngagementLevel(score: number): string {
  if (score < 15) return 'Crítico'
  if (score < 30) return 'Baixo'
  if (score < 50) return 'Médio-Baixo'
  if (score < 70) return 'Médio'
  if (score < 85) return 'Alto'
  return 'Excepcional'
}

/**
 * Retorna breakdown detalhado do cálculo (para debugging)
 */
export function calculateEngagementScoreWithBreakdown(
  userProduct: IUserProductForEvaluation,
  productName: ProductName
): {
  total: number
  breakdown: {
    frequency: number
    progress: number
    consistency: number
  }
  inputs: {
    daysInactive: number
    progressPercentage: number
    loginsLast30Days: number
  }
} {
  const daysInactive = userProduct.engagement?.daysInactive ?? 999
  const progress = userProduct.progress?.percentage ?? 0
  const logins30d = userProduct.engagement?.loginsLast30Days ?? 0

  let frequencyScore = 0
  if (daysInactive === 0) frequencyScore = 40
  else if (daysInactive <= 3) frequencyScore = 30
  else if (daysInactive <= 7) frequencyScore = 20
  else if (daysInactive <= 14) frequencyScore = 10

  const progressScore = Math.round((progress / 100) * 30)

  let consistencyScore = 0
  if (logins30d >= 20) consistencyScore = 30
  else if (logins30d >= 10) consistencyScore = 20
  else if (logins30d >= 5) consistencyScore = 10

  const total = Math.min(100, frequencyScore + progressScore + consistencyScore)

  return {
    total,
    breakdown: {
      frequency: frequencyScore,
      progress: progressScore,
      consistency: consistencyScore
    },
    inputs: {
      daysInactive,
      progressPercentage: progress,
      loginsLast30Days: logins30d
    }
  }
}
