// src/utils/engagementCalculator.ts - CALCULADORA BACKEND
// =====================================================
// 📁 src/utils/engagementCalculator.ts - VERSÃO BACKEND
// =====================================================

export interface UserData {
  engagement?: string;               // "BAIXO" | "MEDIO" | "ALTO" | "LOW" | "MEDIUM" | "HIGH"
  accessCount?: number;              // Número de acessos
  progress?: {
    completedPercentage?: number;    // Progresso em %
    completed?: number;              // Aulas completadas
    total?: number;                  // Total de aulas
  };
  _id?: string;                     // ID do utilizador
  name?: string;                    // Nome do utilizador
  email?: string;                   // Email do utilizador
}

export interface EngagementResult {
  score: number;                     // Score final (0-100)
  level: 'MUITO_BAIXO' | 'BAIXO' | 'MEDIO' | 'ALTO' | 'MUITO_ALTO';
  levelLabel: string;               // Label em português
  color: string;                    // Classes CSS para UI
  icon: string;                     // Emoji para UI
  breakdown: {
    accessScore: number;            // Score dos acessos (0-100)
    progressScore: number;          // Score do progresso (0-100)
    engagementScore: number;        // Score do engagement existente (0-100)
    weights: {
      access: number;               // Peso dos acessos (40%)
      progress: number;             // Peso do progresso (40%)
      engagement: number;           // Peso do engagement (20%)
    };
  };
}

/**
 * 📊 CALCULADORA DE ENGAGEMENT COMBINADO - VERSÃO BACKEND
 *
 * Fórmula: 40% Acessos + 40% Progresso + 20% Engagement
 *
 * @param user - Dados do utilizador
 * @returns Resultado completo do engagement
 */
export function calculateCombinedEngagement(user: UserData): EngagementResult {
  // ✅ 1. CALCULAR SCORE DOS ACESSOS (40%)
  const accessScore = calculateAccessScore(user.accessCount || 0);

  // ✅ 2. CALCULAR SCORE DO PROGRESSO (40%)
  const progressScore = calculateProgressScore(user.progress);

  // ✅ 3. CALCULAR SCORE DO ENGAGEMENT EXISTENTE (20%)
  const engagementScore = calculateEngagementScore(user.engagement);

  // ✅ 4. APLICAR PESOS E CALCULAR SCORE FINAL
  const weights = {
    access: 0.4,      // 40%
    progress: 0.4,    // 40%
    engagement: 0.2   // 20%
  };

  const accessWeighted = accessScore * weights.access;
  const progressWeighted = progressScore * weights.progress;
  const engagementWeighted = engagementScore * weights.engagement;

  const finalScore = Math.round(accessWeighted + progressWeighted + engagementWeighted);

  // ✅ 5. DETERMINAR NÍVEL E CARACTERÍSTICAS
  const level = determineEngagementLevel(finalScore);
  const { levelLabel, color, icon } = getEngagementCharacteristics(level);

  return {
    score: finalScore,
    level,
    levelLabel,
    color,
    icon,
    breakdown: {
      accessScore,
      progressScore,
      engagementScore,
      weights
    }
  };
}

/**
 * 🎯 CALCULAR SCORE DOS ACESSOS (0-100)
 */
function calculateAccessScore(accessCount: number): number {
  if (accessCount === 0) {
    return 0;
  }

  if (accessCount <= 5) {
    const score = Math.min(30, accessCount * 6);
    return score;
  }

  if (accessCount <= 15) {
    const score = 30 + ((accessCount - 5) * 3);
    return score;
  }

  if (accessCount <= 30) {
    const score = 60 + ((accessCount - 15) * 1.67);
    return Math.round(score);
  }

  const score = Math.min(100, 85 + ((accessCount - 30) * 0.5));
  return Math.round(score);
}

/**
 * 📈 CALCULAR SCORE DO PROGRESSO (0-100) - ESCALA LINEAR
 */
function calculateProgressScore(progress?: UserData['progress']): number {
  if (!progress) {
    return 0;
  }

  let percentage = 0;

  // ✅ Usar completedPercentage se disponível
  if (progress.completedPercentage !== undefined) {
    percentage = progress.completedPercentage;
  }
  // ✅ Calcular baseado em completed/total
  else if (progress.completed !== undefined && progress.total !== undefined && progress.total > 0) {
    percentage = (progress.completed / progress.total) * 100;
  }

  // ✅ Escala linear simples
  const score = Math.min(100, Math.round(percentage));
  return score;
}

/**
 * 💡 CALCULAR SCORE DO ENGAGEMENT EXISTENTE (0-100)
 */
function calculateEngagementScore(engagement?: string): number {
  if (!engagement) {
    return 20;
  }

  const level = engagement.toLowerCase();

  let score = 20;
  switch (level) {
    case 'muito_baixo':
    case 'very_low':
    case 'none':
      score = 0;
      break;

    case 'baixo':
    case 'low':
      score = 25;
      break;

    case 'medio':
    case 'medium':
      score = 50;
      break;

    case 'alto':
    case 'high':
      score = 75;
      break;

    case 'muito_alto':
    case 'very_high':
    case 'excellent':
      score = 100;
      break;

    default:
      score = 20;
  }

  return score;
}

/**
 * 📊 DETERMINAR NÍVEL BASEADO NO SCORE FINAL
 * ✅ THRESHOLDS AJUSTADOS (2025-10-12):
 * - Muito Alto: ≥70 (antes ≥80)
 * - Alto: ≥50 (antes ≥60)
 * - Médio: ≥30 (antes ≥40)
 * - Baixo: ≥15 (antes ≥25)
 * - Muito Baixo: <15
 */
function determineEngagementLevel(score: number): EngagementResult['level'] {
  if (score >= 70) {
    return 'MUITO_ALTO';
  } else if (score >= 50) {
    return 'ALTO';
  } else if (score >= 30) {
    return 'MEDIO';
  } else if (score >= 15) {
    return 'BAIXO';
  } else {
    return 'MUITO_BAIXO';
  }
}

/**
 * 🎨 OBTER CARACTERÍSTICAS VISUAIS DO NÍVEL
 */
function getEngagementCharacteristics(level: EngagementResult['level']): {
  levelLabel: string;
  color: string;
  icon: string;
} {
  switch (level) {
    case 'MUITO_ALTO':
      return {
        levelLabel: 'Muito Alto',
        color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        icon: '🔥'
      };
    case 'ALTO':
      return {
        levelLabel: 'Alto',
        color: 'text-green-600 bg-green-50 border-green-200',
        icon: '⚡'
      };
    case 'MEDIO':
      return {
        levelLabel: 'Médio',
        color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
        icon: '📈'
      };
    case 'BAIXO':
      return {
        levelLabel: 'Baixo',
        color: 'text-orange-600 bg-orange-50 border-orange-200',
        icon: '📉'
      };
    case 'MUITO_BAIXO':
    default:
      return {
        levelLabel: 'Muito Baixo',
        color: 'text-red-600 bg-red-50 border-red-200',
        icon: '💤'
      };
  }
}
