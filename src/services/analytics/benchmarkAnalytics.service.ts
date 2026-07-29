export interface ClassBenchmarkMetric {
  classId: string
  className: string
  totalStudents: number
  activeStudents: number
  activityRate: number
  averageEngagement: number
  averageProgress: number
}

export interface BenchmarkLevels {
  excellent: number
  good: number
  average: number
  needsImprovement: number
  poor: number
}

export interface BenchmarkInsight {
  type: 'warning' | 'info' | 'success'
  message: string
  recommendation: string
}

export interface BenchmarksResult {
  benchmarks: {
    engagement: BenchmarkLevels
    progress: BenchmarkLevels
    activityRate: BenchmarkLevels
    classSize: {
      large: number
      medium: number
      small: number
    }
  }
  industryStats: {
    totalClasses: number
    totalStudents: number
    averageClassSize: number
    overallEngagement: number
    overallProgress: number
    overallActivityRate: number
  }
  topPerformers: ClassBenchmarkMetric[]
  needsAttention: ClassBenchmarkMetric[]
  insights: BenchmarkInsight[]
  metadata: {
    calculationDate: string
    calculationDuration: number
    classesAnalyzed: number
    dataFreshness: 'Calculado em tempo real'
  }
}

export interface EmptyBenchmarksResult {
  message:
    | 'Nenhuma turma ativa encontrada para calcular benchmarks'
    | 'Nenhuma turma com dados válidos encontrada'
  totalClasses: 0
}

export interface BenchmarkClassRead {
  totalStudents: number
  activeStudents: number
  averageEngagement: number
  averageProgress: number
}

export interface BenchmarkAnalyticsRead {
  activeClasses: Array<{ classId: string; className: string }>
  metricsByClassId: ReadonlyMap<string, BenchmarkClassRead>
}

export interface BenchmarkAnalyticsReader {
  read(): Promise<BenchmarkAnalyticsRead>
}

export type BenchmarkAnalyticsResult =
  | { empty: true; data: EmptyBenchmarksResult }
  | {
      empty: false
      data: BenchmarksResult
      timestamp: number
    }

interface BenchmarkMetadata {
  calculationDate: string
  calculationDuration: number
}

function nearestRank(
  sortedValues: readonly number[],
  percentile: number,
): number {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil((percentile / 100) * sortedValues.length) - 1
  return sortedValues[Math.max(0, index)] ?? 0
}

function levels(values: readonly number[]): BenchmarkLevels {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    excellent: nearestRank(sorted, 90),
    good: nearestRank(sorted, 75),
    average: nearestRank(sorted, 50),
    needsImprovement: nearestRank(sorted, 25),
    poor: nearestRank(sorted, 10),
  }
}

function performanceScore(metric: ClassBenchmarkMetric): number {
  return metric.averageEngagement + metric.averageProgress
}

function compareClassId(
  left: ClassBenchmarkMetric,
  right: ClassBenchmarkMetric,
): number {
  return left.classId.localeCompare(right.classId)
}

const sum = (
  metrics: readonly ClassBenchmarkMetric[],
  select: (metric: ClassBenchmarkMetric) => number,
): number => metrics.reduce((total, metric) => total + select(metric), 0)

export function calculateBenchmarks(
  metrics: readonly ClassBenchmarkMetric[],
  metadata: BenchmarkMetadata,
): BenchmarksResult {
  const engagement = levels(metrics.map(metric => metric.averageEngagement))
  const progress = levels(metrics.map(metric => metric.averageProgress))
  const activityRate = levels(metrics.map(metric => metric.activityRate))
  const studentCounts = metrics
    .map(metric => metric.totalStudents)
    .sort((left, right) => left - right)

  const topPerformers = metrics
    .filter(metric =>
      metric.averageEngagement >= engagement.good
      && metric.averageProgress >= progress.good)
    .sort((left, right) =>
      performanceScore(right) - performanceScore(left)
      || compareClassId(left, right))
    .slice(0, 10)

  const needsAttention = metrics
    .filter(metric =>
      metric.averageEngagement <= engagement.needsImprovement
      || metric.averageProgress <= progress.needsImprovement)
    .sort((left, right) =>
      performanceScore(left) - performanceScore(right)
      || compareClassId(left, right))
    .slice(0, 10)

  const totalStudents = sum(metrics, metric => metric.totalStudents)
  const industryStats = {
    totalClasses: metrics.length,
    totalStudents,
    averageClassSize: Math.round(totalStudents / metrics.length),
    overallEngagement: Math.round(
      sum(metrics, metric => metric.averageEngagement) / metrics.length,
    ),
    overallProgress: Math.round(
      sum(metrics, metric => metric.averageProgress) / metrics.length,
    ),
    overallActivityRate: Math.round(
      sum(metrics, metric => metric.activityRate) / metrics.length,
    ),
  }

  const insights: BenchmarkInsight[] = []
  if (industryStats.overallEngagement < 50) {
    insights.push({
      type: 'warning',
      message: `O engagement médio da plataforma (${industryStats.overallEngagement}%) está abaixo do ideal (50%+)`,
      recommendation: 'Considere implementar estratégias globais de engagement',
    })
  }
  if (industryStats.overallActivityRate < 80) {
    insights.push({
      type: 'info',
      message: `A taxa de atividade média (${industryStats.overallActivityRate}%) pode ser melhorada`,
      recommendation: 'Analise campanhas de reativação para alunos inativos',
    })
  }
  if (topPerformers.length > 0) {
    insights.push({
      type: 'success',
      message: `${topPerformers.length} turmas estão com performance excellent`,
      recommendation: 'Analise as melhores práticas dessas turmas para replicar',
    })
  }

  return {
    benchmarks: {
      engagement,
      progress,
      activityRate,
      classSize: {
        large: nearestRank(studentCounts, 90),
        medium: nearestRank(studentCounts, 50),
        small: nearestRank(studentCounts, 25),
      },
    },
    industryStats,
    topPerformers,
    needsAttention,
    insights,
    metadata: {
      ...metadata,
      classesAnalyzed: metrics.length,
      dataFreshness: 'Calculado em tempo real',
    },
  }
}

export class BenchmarkAnalyticsService {
  constructor(
    private readonly reader: BenchmarkAnalyticsReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async get(): Promise<BenchmarkAnalyticsResult> {
    const startedAt = this.now()
    const read = await this.reader.read()

    if (read.activeClasses.length === 0) {
      return {
        empty: true,
        data: {
          message: 'Nenhuma turma ativa encontrada para calcular benchmarks',
          totalClasses: 0,
        },
      }
    }

    const metrics = read.activeClasses.flatMap((activeClass) => {
      const classRead = read.metricsByClassId.get(activeClass.classId)
      if (!classRead || classRead.totalStudents <= 0) return []

      return [{
        classId: activeClass.classId,
        className: activeClass.className,
        totalStudents: classRead.totalStudents,
        activeStudents: classRead.activeStudents,
        activityRate: Math.round(
          (classRead.activeStudents / classRead.totalStudents) * 100,
        ),
        averageEngagement: Math.round(classRead.averageEngagement),
        averageProgress: Math.round(classRead.averageProgress),
      }]
    })

    if (metrics.length === 0) {
      return {
        empty: true,
        data: {
          message: 'Nenhuma turma com dados válidos encontrada',
          totalClasses: 0,
        },
      }
    }

    const finishedAt = this.now()
    return {
      empty: false,
      data: calculateBenchmarks(metrics, {
        calculationDate: finishedAt.toISOString(),
        calculationDuration: finishedAt.getTime() - startedAt.getTime(),
      }),
      timestamp: finishedAt.getTime(),
    }
  }
}
