export type OpportunityPriority = 'high' | 'medium' | 'low' | 'info'

export interface OpportunityItem {
  type: string
  priority: OpportunityPriority
  title: string
  description: string
  suggestion: string
  impact: string
}

export interface ClassOpportunityAnalyticsSnapshot {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  averageProgress: number
  healthScore: number
  engagementDistribution: {
    muito_alto: number
    alto: number
    medio: number
    baixo: number
    muito_baixo: number
  }
  healthFactors?: {
    retention: number
  }
}

export interface ClassOpportunitiesReader {
  getClassAnalytics(
    classId: string,
  ): Promise<ClassOpportunityAnalyticsSnapshot | null>
}

export interface ClassOpportunitiesData {
  classId: string
  className: string
  totalOpportunities: number
  opportunities: OpportunityItem[]
  classMetrics: {
    totalStudents: number
    activeStudents: number
    averageEngagement: number
    healthScore: number
    averageProgress: number
  }
  summary: {
    highPriority: number
    mediumPriority: number
    lowPriority: number
    positiveInsights: number
  }
  analysisDate: string
}

export type ClassOpportunitiesResult =
  | { found: false }
  | {
      found: true
      data: ClassOpportunitiesData
      timestamp: number
    }

type OpportunityRule = (
  analytics: ClassOpportunityAnalyticsSnapshot,
) => OpportunityItem | null

const opportunityRules: readonly OpportunityRule[] = [
  (analytics) =>
    analytics.averageEngagement < 50
      ? {
          type: 'engagement',
          priority: 'high',
          title: 'Engagement Baixo',
          description:
            `O engagement médio da turma (${analytics.averageEngagement}%) ` +
            'está abaixo da média recomendada (50%)',
          suggestion:
            'Considere enviar mensagens de motivação ou criar conteúdo mais interativo',
          impact: 'Alto',
        }
      : null,
  (analytics) => {
    if (analytics.totalStudents <= 0) return null

    const inactiveRate =
      ((analytics.totalStudents - analytics.activeStudents) /
        analytics.totalStudents) *
      100

    return inactiveRate > 30
      ? {
          type: 'activity',
          priority: 'high',
          title: 'Muitos Alunos Inativos',
          description: `${Math.round(inactiveRate)}% dos alunos estão inativos`,
          suggestion:
            'Implemente uma campanha de reativação ou analise as barreiras de acesso',
          impact: 'Alto',
        }
      : null
  },
  (analytics) =>
    analytics.averageProgress < 40
      ? {
          type: 'progress',
          priority: 'medium',
          title: 'Progresso Lento',
          description:
            `O progresso médio da turma (${analytics.averageProgress}%) ` +
            'pode ser melhorado',
          suggestion:
            'Considere criar marcos intermediários ou gamificação para motivar os alunos',
          impact: 'Médio',
        }
      : null,
  (analytics) =>
    analytics.healthScore < 60
      ? {
          type: 'health',
          priority: 'high',
          title: 'Health Score Baixo',
          description:
            `O health score da turma (${analytics.healthScore}) ` +
            'indica problemas estruturais',
          suggestion:
            'Revise a estratégia geral da turma e analise os fatores específicos do health score',
          impact: 'Alto',
        }
      : null,
  (analytics) => {
    if (analytics.totalStudents <= 0) return null

    const lowEngagementCount =
      (analytics.engagementDistribution.baixo || 0) +
      (analytics.engagementDistribution.muito_baixo || 0)
    const lowEngagementPercentage =
      (lowEngagementCount / analytics.totalStudents) * 100

    return lowEngagementPercentage > 40
      ? {
          type: 'distribution',
          priority: 'medium',
          title: 'Concentração de Baixo Engagement',
          description:
            `${Math.round(lowEngagementPercentage)}% dos alunos têm ` +
            'engagement baixo ou muito baixo',
          suggestion:
            'Segmente estes alunos para ações específicas de engagement e suporte personalizado',
          impact: 'Médio',
        }
      : null
  },
  (analytics) =>
    analytics.averageProgress > 0 && analytics.averageProgress < 25
      ? {
          type: 'progress_critical',
          priority: 'high',
          title: 'Progresso Crítico',
          description:
            `O progresso médio está muito baixo ` +
            `(${analytics.averageProgress}%)`,
          suggestion:
            'Intervenção urgente necessária - revise conteúdo e métodos de ensino',
          impact: 'Crítico',
        }
      : null,
  (analytics) =>
    analytics.healthFactors && analytics.healthFactors.retention < 50
      ? {
          type: 'retention',
          priority: 'high',
          title: 'Problemas de Retenção',
          description:
            `O fator de retenção está baixo ` +
            `(${analytics.healthFactors.retention})`,
          suggestion:
            'Analise os padrões de abandono e implemente estratégias de retenção',
          impact: 'Alto',
        }
      : null,
  (analytics) =>
    analytics.averageEngagement >= 50 &&
    analytics.averageEngagement < 70
      ? {
          type: 'engagement_improvement',
          priority: 'medium',
          title: 'Engagement Moderado',
          description:
            `O engagement está na média (${analytics.averageEngagement}%) ` +
            'mas pode ser otimizado',
          suggestion:
            'Implemente técnicas avançadas de gamificação ou conteúdo interativo',
          impact: 'Médio',
        }
      : null,
  (analytics) => {
    if (analytics.totalStudents <= 0) return null

    const activityRate =
      (analytics.activeStudents / analytics.totalStudents) * 100

    return activityRate >= 70 && activityRate < 90
      ? {
          type: 'activity_optimization',
          priority: 'low',
          title: 'Otimização de Atividade',
          description:
            `Taxa de atividade boa (${Math.round(activityRate)}%) ` +
            'mas pode chegar a excelência',
          suggestion:
            'Identifique os últimos alunos inativos e crie campanhas direcionadas',
          impact: 'Baixo',
        }
      : null
  },
  (analytics) =>
    analytics.averageEngagement > 70
      ? {
          type: 'success',
          priority: 'info',
          title: 'Engagement Excelente',
          description:
            `A turma tem engagement excelente de ` +
            `${analytics.averageEngagement}%`,
          suggestion:
            'Mantenha as estratégias atuais e considere documentar as melhores práticas para replicar em outras turmas',
          impact: 'Positivo',
        }
      : null,
  (analytics) =>
    analytics.healthScore > 80
      ? {
          type: 'excellence',
          priority: 'info',
          title: 'Turma de Alta Performance',
          description:
            `Health score excelente (${analytics.healthScore}) ` +
            'indica uma turma muito bem gerida',
          suggestion:
            'Use esta turma como referência e case study para outras turmas',
          impact: 'Referência',
        }
      : null,
  (analytics) => {
    if (analytics.totalStudents <= 0) return null

    const highEngagementCount =
      (analytics.engagementDistribution.muito_alto || 0) +
      (analytics.engagementDistribution.alto || 0)
    const highEngagementPercentage =
      (highEngagementCount / analytics.totalStudents) * 100

    return highEngagementPercentage > 60
      ? {
          type: 'balance',
          priority: 'info',
          title: 'Distribuição Positiva',
          description:
            `${Math.round(highEngagementPercentage)}% dos alunos têm ` +
            'alto engagement',
          suggestion:
            'Aproveite os alunos engajados como mentores para os demais',
          impact: 'Estratégico',
        }
      : null
  },
]

const priorityOrder: Record<OpportunityPriority, number> = {
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
}

const countPriority = (
  opportunities: OpportunityItem[],
  priority: OpportunityPriority,
): number =>
  opportunities.filter((opportunity) => opportunity.priority === priority)
    .length

export function deriveClassOpportunities(
  analytics: ClassOpportunityAnalyticsSnapshot,
  analysisDate: string,
): ClassOpportunitiesData {
  const opportunities = opportunityRules
    .map((rule, sourceIndex) => ({
      opportunity: rule(analytics),
      sourceIndex,
    }))
    .filter(
      (
        item,
      ): item is { opportunity: OpportunityItem; sourceIndex: number } =>
        item.opportunity !== null,
    )
    .sort(
      (left, right) =>
        priorityOrder[left.opportunity.priority] -
          priorityOrder[right.opportunity.priority] ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ opportunity }) => opportunity)

  return {
    classId: analytics.classId,
    className: analytics.className,
    totalOpportunities: opportunities.length,
    opportunities,
    classMetrics: {
      totalStudents: analytics.totalStudents,
      activeStudents: analytics.activeStudents,
      averageEngagement: analytics.averageEngagement,
      healthScore: analytics.healthScore,
      averageProgress: analytics.averageProgress,
    },
    summary: {
      highPriority: countPriority(opportunities, 'high'),
      mediumPriority: countPriority(opportunities, 'medium'),
      lowPriority: countPriority(opportunities, 'low'),
      positiveInsights: countPriority(opportunities, 'info'),
    },
    analysisDate,
  }
}

export class ClassOpportunitiesService {
  constructor(
    private readonly reader: ClassOpportunitiesReader,
    private readonly now: () => number = Date.now,
  ) {}

  async getForClass(classId: string): Promise<ClassOpportunitiesResult> {
    const analytics = await this.reader.getClassAnalytics(classId)
    if (!analytics) return { found: false }

    const timestamp = this.now()
    return {
      found: true,
      data: deriveClassOpportunities(
        analytics,
        new Date(timestamp).toISOString(),
      ),
      timestamp,
    }
  }
}
