export interface HealthScoreInput {
  avgEngagement: number
  activeCount: number
  totalCount: number
  newLast7Days: number
  avgProgress: number
}

export interface HealthScoreResult {
  healthScore: number
  healthLevel: 'EXCELENTE' | 'BOM' | 'RAZOÁVEL' | 'CRÍTICO'
  healthBreakdown: {
    engagement: number
    retention: number
    growth: number
    progress: number
  }
}

function percentage(numerator: number, denominator: number): number {
  return denominator <= 0
    ? 0
    : Math.min(100, Math.round((numerator / denominator) * 100))
}

export function calculateHealthScore(
  input: HealthScoreInput,
): HealthScoreResult {
  const { avgEngagement, activeCount, totalCount, newLast7Days, avgProgress } = input
  const retention = percentage(activeCount, totalCount)
  const growth = totalCount <= 0
    ? 0
    : Math.min(100, Math.round((newLast7Days / totalCount) * 1000))

  const healthScore = Math.round(
    (avgEngagement * 0.4) +
    (retention * 0.3) +
    (growth * 0.2) +
    (avgProgress * 0.1),
  )

  const healthLevel =
    healthScore >= 85 ? 'EXCELENTE' :
    healthScore >= 75 ? 'BOM' :
    healthScore >= 60 ? 'RAZOÁVEL' : 'CRÍTICO'

  return {
    healthScore,
    healthLevel,
    healthBreakdown: {
      engagement: avgEngagement,
      retention,
      growth,
      progress: avgProgress,
    },
  }
}
