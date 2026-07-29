import {
  BenchmarkAnalyticsService,
  calculateBenchmarks,
  type BenchmarkAnalyticsRead,
  type BenchmarkAnalyticsReader,
  type ClassBenchmarkMetric,
} from '../../../src/services/analytics/benchmarkAnalytics.service'

const metric = (
  classId: string,
  engagement: number,
  progress: number,
  activityRate = 80,
  totalStudents = 10,
): ClassBenchmarkMetric => ({
  classId,
  className: `Class ${classId}`,
  totalStudents,
  activeStudents: Math.round((activityRate / 100) * totalStudents),
  activityRate,
  averageEngagement: engagement,
  averageProgress: progress,
})

const metadata = {
  calculationDate: '2026-07-29T10:00:00.025Z',
  calculationDuration: 25,
}

describe('calculateBenchmarks', () => {
  it('uses nearest-rank percentiles for every benchmark family', () => {
    const result = calculateBenchmarks([
      metric('10', 10, 10, 10, 10),
      metric('25', 25, 25, 25, 25),
      metric('50', 50, 50, 50, 50),
      metric('75', 75, 75, 75, 75),
      metric('90', 90, 90, 90, 90),
    ], metadata)

    expect(result.benchmarks).toEqual({
      engagement: {
        excellent: 90,
        good: 75,
        average: 50,
        needsImprovement: 25,
        poor: 10,
      },
      progress: {
        excellent: 90,
        good: 75,
        average: 50,
        needsImprovement: 25,
        poor: 10,
      },
      activityRate: {
        excellent: 90,
        good: 75,
        average: 50,
        needsImprovement: 25,
        poor: 10,
      },
      classSize: {
        large: 90,
        medium: 50,
        small: 25,
      },
    })
  })

  it('ranks qualified classes deterministically after filtering', () => {
    const result = calculateBenchmarks([
      metric('z', 90, 80),
      metric('m', 10, 20),
      metric('a', 80, 90),
      metric('b', 20, 10),
    ], metadata)

    expect(result.topPerformers.map(item => item.classId)).toEqual(['a', 'z'])
    expect(result.needsAttention.map(item => item.classId)).toEqual(['b', 'm'])
  })

  it('limits ranked lists only after deterministic sorting', () => {
    const input = Array.from({ length: 12 }, (_, index) =>
      metric(`class-${String(11 - index).padStart(2, '0')}`, 50, 50))

    const result = calculateBenchmarks(input, metadata)

    expect(result.topPerformers).toHaveLength(10)
    expect(result.needsAttention).toHaveLength(10)
    expect(result.topPerformers.map(item => item.classId)).toEqual(
      Array.from({ length: 10 }, (_, index) =>
        `class-${String(index).padStart(2, '0')}`),
    )
  })

  it('calculates rounded industry stats and preserves insight thresholds', () => {
    const result = calculateBenchmarks([
      metric('low', 20, 30, 50, 3),
      metric('high', 80, 70, 100, 2),
    ], metadata)

    expect(result.industryStats).toEqual({
      totalClasses: 2,
      totalStudents: 5,
      averageClassSize: 3,
      overallEngagement: 50,
      overallProgress: 50,
      overallActivityRate: 75,
    })
    expect(result.insights).toEqual([
      {
        type: 'info',
        message: 'A taxa de atividade média (75%) pode ser melhorada',
        recommendation: 'Analise campanhas de reativação para alunos inativos',
      },
      {
        type: 'success',
        message: '1 turmas estão com performance excellent',
        recommendation: 'Analise as melhores práticas dessas turmas para replicar',
      },
    ])
    expect(result.metadata).toEqual({
      ...metadata,
      classesAnalyzed: 2,
      dataFreshness: 'Calculado em tempo real',
    })
  })

  it('emits the engagement warning below fifty', () => {
    const result = calculateBenchmarks([
      metric('low', 49, 80, 80),
    ], metadata)

    expect(result.insights[0]).toEqual({
      type: 'warning',
      message: 'O engagement médio da plataforma (49%) está abaixo do ideal (50%+)',
      recommendation: 'Considere implementar estratégias globais de engagement',
    })
  })
})

const readerWith = (read: BenchmarkAnalyticsRead): BenchmarkAnalyticsReader => ({
  read: jest.fn().mockResolvedValue(read),
})

describe('BenchmarkAnalyticsService', () => {
  it('returns the exact no-active-class legacy result', async () => {
    const service = new BenchmarkAnalyticsService(readerWith({
      activeClasses: [],
      metricsByClassId: new Map(),
    }))

    await expect(service.get()).resolves.toEqual({
      empty: true,
      data: {
        message: 'Nenhuma turma ativa encontrada para calcular benchmarks',
        totalClasses: 0,
      },
    })
  })

  it('returns the exact no-valid-data legacy result', async () => {
    const service = new BenchmarkAnalyticsService(readerWith({
      activeClasses: [{ classId: 'empty', className: 'Empty' }],
      metricsByClassId: new Map([
        ['empty', {
          totalStudents: 0,
          activeStudents: 0,
          averageEngagement: 0,
          averageProgress: 0,
        }],
      ]),
    }))

    await expect(service.get()).resolves.toEqual({
      empty: true,
      data: {
        message: 'Nenhuma turma com dados válidos encontrada',
        totalClasses: 0,
      },
    })
  })

  it('joins reader data and timestamps a populated result once', async () => {
    const read: BenchmarkAnalyticsRead = {
      activeClasses: [{ classId: 'class-a', className: 'Class A' }],
      metricsByClassId: new Map([
        ['class-a', {
          totalStudents: 3,
          activeStudents: 2,
          averageEngagement: 59.6,
          averageProgress: 49.6,
        }],
      ]),
    }
    const reader = readerWith(read)
    const times = [
      new Date('2026-07-29T10:00:00.000Z'),
      new Date('2026-07-29T10:00:00.025Z'),
    ]
    const now = jest.fn(() => times.shift() ?? new Date(0))
    const service = new BenchmarkAnalyticsService(reader, now)

    const result = await service.get()

    expect(result.empty).toBe(false)
    if (result.empty) throw new Error('expected populated result')
    expect(result.timestamp).toBe(
      new Date('2026-07-29T10:00:00.025Z').getTime(),
    )
    expect(result.data.topPerformers[0]).toMatchObject({
      classId: 'class-a',
      totalStudents: 3,
      activeStudents: 2,
      activityRate: 67,
      averageEngagement: 60,
      averageProgress: 50,
    })
    expect(result.data.metadata).toMatchObject({
      calculationDate: '2026-07-29T10:00:00.025Z',
      calculationDuration: 25,
    })
    expect(reader.read).toHaveBeenCalledTimes(1)
    expect(now).toHaveBeenCalledTimes(2)
  })

  it('lets reader failures reach the HTTP boundary', async () => {
    const service = new BenchmarkAnalyticsService({
      read: jest.fn().mockRejectedValue(new Error('reader failed')),
    })

    await expect(service.get()).rejects.toThrow('reader failed')
  })
})
