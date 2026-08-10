import {
  ClassOpportunitiesService,
  deriveClassOpportunities,
  type ClassOpportunitiesReader,
  type ClassOpportunityAnalyticsSnapshot,
} from '../../../src/services/analytics/classOpportunities.service'

const baseAnalytics: ClassOpportunityAnalyticsSnapshot = {
  classId: 'class-a',
  className: 'Class A',
  totalStudents: 10,
  activeStudents: 10,
  averageEngagement: 70,
  averageProgress: 50,
  healthScore: 80,
  engagementDistribution: {
    muito_alto: 0,
    alto: 0,
    medio: 10,
    baixo: 0,
    muito_baixo: 0,
  },
  healthFactors: { retention: 50 },
}

const analyticsWith = (
  changes: Partial<ClassOpportunityAnalyticsSnapshot>,
): ClassOpportunityAnalyticsSnapshot => ({
  ...baseAnalytics,
  ...changes,
  engagementDistribution: {
    ...baseAnalytics.engagementDistribution,
    ...changes.engagementDistribution,
  },
})

describe('deriveClassOpportunities', () => {
  it('keeps the existing negative rules in stable priority order', () => {
    const data = deriveClassOpportunities(
      analyticsWith({
        activeStudents: 5,
        averageEngagement: 20,
        averageProgress: 20,
        healthScore: 30,
        engagementDistribution: {
          muito_alto: 0,
          alto: 0,
          medio: 5,
          baixo: 3,
          muito_baixo: 2,
        },
        healthFactors: { retention: 20 },
      }),
      '2026-07-29T12:00:00.000Z',
    )

    expect(data.opportunities.map(({ type, priority }) => ({
      type,
      priority,
    }))).toEqual([
      { type: 'engagement', priority: 'high' },
      { type: 'activity', priority: 'high' },
      { type: 'health', priority: 'high' },
      { type: 'progress_critical', priority: 'high' },
      { type: 'retention', priority: 'high' },
      { type: 'progress', priority: 'medium' },
      { type: 'distribution', priority: 'medium' },
    ])
    expect(data.opportunities[0]).toEqual({
      type: 'engagement',
      priority: 'high',
      title: 'Engagement Baixo',
      description:
        'O engagement médio da turma (20%) está abaixo da média recomendada (50%)',
      suggestion:
        'Considere enviar mensagens de motivação ou criar conteúdo mais interativo',
      impact: 'Alto',
    })
    expect(data).toMatchObject({
      classId: 'class-a',
      className: 'Class A',
      totalOpportunities: 7,
      classMetrics: {
        totalStudents: 10,
        activeStudents: 5,
        averageEngagement: 20,
        healthScore: 30,
        averageProgress: 20,
      },
      summary: {
        highPriority: 5,
        mediumPriority: 2,
        lowPriority: 0,
        positiveInsights: 0,
      },
      analysisDate: '2026-07-29T12:00:00.000Z',
    })
  })

  it('preserves the intentional overlap between low and critical progress', () => {
    const data = deriveClassOpportunities(
      analyticsWith({ averageProgress: 20 }),
      '2026-07-29T12:00:00.000Z',
    )

    expect(data.opportunities.map(({ type }) => type)).toEqual([
      'progress_critical',
      'progress',
    ])
  })

  it('keeps engagement 50 out of the low-engagement rule', () => {
    const data = deriveClassOpportunities(
      analyticsWith({ averageEngagement: 50 }),
      '2026-07-29T12:00:00.000Z',
    )

    expect(data.opportunities.map(({ type }) => type))
      .toEqual(['engagement_improvement'])
  })

  it('keeps strict threshold edges and distinguishes zero progress', () => {
    const atEdges = deriveClassOpportunities(
      analyticsWith({
        activeStudents: 9,
        averageProgress: 40,
        engagementDistribution: {
          muito_alto: 0,
          alto: 6,
          medio: 0,
          baixo: 4,
          muito_baixo: 0,
        },
      }),
      '2026-07-29T12:00:00.000Z',
    )
    const atZeroProgress = deriveClassOpportunities(
      analyticsWith({ averageProgress: 0 }),
      '2026-07-29T12:00:00.000Z',
    )

    expect(atEdges.opportunities).toEqual([])
    expect(atZeroProgress.opportunities.map(({ type }) => type))
      .toEqual(['progress'])
  })

  it('guards rate rules when the class has no students', () => {
    const data = deriveClassOpportunities(
      analyticsWith({
        totalStudents: 0,
        activeStudents: 0,
        averageProgress: 50,
        engagementDistribution: {
          muito_alto: 10,
          alto: 10,
          medio: 0,
          baixo: 10,
          muito_baixo: 10,
        },
      }),
      '2026-07-29T12:00:00.000Z',
    )

    expect(data.opportunities).toEqual([])
    expect(JSON.stringify(data)).not.toMatch(/NaN|Infinity/)
  })

  it('returns the existing positive insights and their summary', () => {
    const data = deriveClassOpportunities(
      analyticsWith({
        averageEngagement: 80,
        healthScore: 90,
        engagementDistribution: {
          muito_alto: 4,
          alto: 3,
          medio: 3,
          baixo: 0,
          muito_baixo: 0,
        },
      }),
      '2026-07-29T12:00:00.000Z',
    )

    expect(data.opportunities.map(({ type, priority }) => ({
      type,
      priority,
    }))).toEqual([
      { type: 'success', priority: 'info' },
      { type: 'excellence', priority: 'info' },
      { type: 'balance', priority: 'info' },
    ])
    expect(data.summary).toEqual({
      highPriority: 0,
      mediumPriority: 0,
      lowPriority: 0,
      positiveInsights: 3,
    })
  })
})

describe('ClassOpportunitiesService', () => {
  it('reads once and timestamps a populated result through the injected clock', async () => {
    const reader: ClassOpportunitiesReader = {
      getClassAnalytics: jest.fn().mockResolvedValue(baseAnalytics),
    }
    const service = new ClassOpportunitiesService(
      reader,
      () => Date.parse('2026-07-29T13:00:00.000Z'),
    )

    await expect(service.getForClass('class-a')).resolves.toEqual({
      found: true,
      timestamp: Date.parse('2026-07-29T13:00:00.000Z'),
      data: expect.objectContaining({
        classId: 'class-a',
        analysisDate: '2026-07-29T13:00:00.000Z',
      }),
    })
    expect(reader.getClassAnalytics).toHaveBeenCalledWith('class-a')
    expect(reader.getClassAnalytics).toHaveBeenCalledTimes(1)
  })

  it('returns not found without fabricating opportunity data', async () => {
    const reader: ClassOpportunitiesReader = {
      getClassAnalytics: jest.fn().mockResolvedValue(null),
    }
    const service = new ClassOpportunitiesService(reader)

    await expect(service.getForClass('missing')).resolves.toEqual({
      found: false,
    })
  })

  it('lets dependency failures reach the central HTTP boundary', async () => {
    const failure = new Error('database-secret-detail')
    const reader: ClassOpportunitiesReader = {
      getClassAnalytics: jest.fn().mockRejectedValue(failure),
    }
    const service = new ClassOpportunitiesService(reader)

    await expect(service.getForClass('class-a')).rejects.toBe(failure)
  })
})
