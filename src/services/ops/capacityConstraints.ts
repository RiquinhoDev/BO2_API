// Onde vamos bater primeiro. Um numero de consumo sozinho nao decide nada; o
// que decide e a distancia ao teto contratado e a velocidade a que essa
// distancia esta a encurtar.

export type ConstraintSeverity = 'ok' | 'atencao' | 'critico' | 'sem-teto'

export interface Constraint {
  readonly id: string
  readonly label: string
  readonly unit: string
  readonly current: number
  readonly ceiling: number | null
  readonly percentOfCeiling: number | null
  /** Variacao media por semana, nas unidades da metrica. */
  readonly perWeekChange: number | null
  readonly weeksToCeiling: number | null
  readonly severity: ConstraintSeverity
  /**
   * Falso quando a serie ainda nao tem um unico valor medido. Sem isto, o
   * painel mostrava "0" com selo verde para metricas que ninguem mediu ainda —
   * que se le como facto e nao como ausencia.
   */
  readonly hasData: boolean
  readonly note?: string
}

export interface ConstraintInput {
  readonly id: string
  readonly label: string
  readonly unit: string
  /** Serie diaria, do dia mais antigo para o mais recente. Nulos sao ignorados. */
  readonly series: readonly (number | null)[]
  readonly ceiling: number | null
  readonly note?: string
}

/**
 * Declive por dia por minimos quadrados. Preferimos isto a "ultimo menos
 * primeiro" porque um unico dia atipico — um backfill, um dia de avaria —
 * inclinava a projecao toda.
 */
export function dailySlope(series: readonly (number | null)[]): number | null {
  const points: Array<{ x: number; y: number }> = []
  series.forEach((value, index) => {
    if (typeof value === 'number' && Number.isFinite(value)) points.push({ x: index, y: value })
  })
  if (points.length < 3) return null

  const n = points.length
  const sumX = points.reduce((sum, point) => sum + point.x, 0)
  const sumY = points.reduce((sum, point) => sum + point.y, 0)
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0)
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0)
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return null

  return (n * sumXY - sumX * sumY) / denominator
}

function hasAnyValue(series: readonly (number | null)[]): boolean {
  return series.some((value) => typeof value === 'number' && Number.isFinite(value))
}

function lastValue(series: readonly (number | null)[]): number {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    const value = series[index]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return 0
}

function severityOf(
  percentOfCeiling: number | null,
  weeksToCeiling: number | null,
): ConstraintSeverity {
  if (percentOfCeiling === null) return 'sem-teto'
  if (percentOfCeiling >= 90) return 'critico'
  if (weeksToCeiling !== null && weeksToCeiling <= 4) return 'critico'
  if (percentOfCeiling >= 70) return 'atencao'
  if (weeksToCeiling !== null && weeksToCeiling <= 12) return 'atencao'
  return 'ok'
}

const SEVERITY_ORDER: Readonly<Record<ConstraintSeverity, number>> = {
  critico: 0,
  atencao: 1,
  ok: 2,
  'sem-teto': 3,
}

export function buildConstraint(input: ConstraintInput): Constraint {
  const measured = hasAnyValue(input.series)
  const current = lastValue(input.series)
  const slope = dailySlope(input.series)
  const perWeekChange = slope === null ? null : slope * 7

  const percentOfCeiling =
    !measured || input.ceiling === null || input.ceiling <= 0
      ? null
      : (current / input.ceiling) * 100

  let weeksToCeiling: number | null = null
  if (input.ceiling !== null && perWeekChange !== null && perWeekChange > 0) {
    const remaining = input.ceiling - current
    weeksToCeiling = remaining <= 0 ? 0 : remaining / perWeekChange
  }

  return {
    id: input.id,
    label: input.label,
    unit: input.unit,
    current,
    ceiling: input.ceiling,
    percentOfCeiling,
    perWeekChange,
    weeksToCeiling,
    severity: measured ? severityOf(percentOfCeiling, weeksToCeiling) : 'sem-teto',
    hasData: measured,
    ...(input.note ? { note: input.note } : {}),
  }
}

/** Do mais urgente para o menos; a igualdade desempata pela percentagem do teto. */
export function rankConstraints(constraints: readonly Constraint[]): readonly Constraint[] {
  return [...constraints].sort((left, right) => {
    const bySeverity = SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]
    if (bySeverity !== 0) return bySeverity
    return (right.percentOfCeiling ?? -1) - (left.percentOfCeiling ?? -1)
  })
}

export interface ScaleProjectionRow {
  readonly id: string
  readonly label: string
  readonly unit: string
  readonly projected: number
  readonly ceiling: number | null
  readonly percentOfCeiling: number | null
  readonly fits: boolean | null
}

export interface ScaleProjection {
  readonly multiplier: number
  readonly students: number
  readonly rows: readonly ScaleProjectionRow[]
  /** Primeira restricao a rebentar neste cenario, se alguma rebentar. */
  readonly firstToBreak: string | null
}

export interface ScalableMetric {
  readonly id: string
  readonly label: string
  readonly unit: string
  /** Consumo atual desta metrica. */
  readonly current: number
  readonly ceiling: number | null
  /**
   * Parte do consumo que nao depende do numero de alunos (crons de mercado,
   * indices, overhead). So o resto e multiplicado no cenario.
   */
  readonly fixedPortion?: number
}

/**
 * Projecao por escala. Assume que o consumo variavel cresce proporcionalmente
 * ao numero de alunos — e grosseiro, mas e a leitura certa para decidir plano:
 * diz qual o recurso que rebenta primeiro, nao quando rebenta ao dia.
 */
export function projectScale(
  metrics: readonly ScalableMetric[],
  currentStudents: number,
  multipliers: readonly number[] = [1.5, 2, 3],
): readonly ScaleProjection[] {
  return multipliers.map((multiplier) => {
    const rows = metrics.map((metric): ScaleProjectionRow => {
      const fixed = metric.fixedPortion ?? 0
      const variable = Math.max(0, metric.current - fixed)
      const projected = fixed + variable * multiplier
      const percentOfCeiling =
        metric.ceiling === null || metric.ceiling <= 0
          ? null
          : (projected / metric.ceiling) * 100

      return {
        id: metric.id,
        label: metric.label,
        unit: metric.unit,
        projected,
        ceiling: metric.ceiling,
        percentOfCeiling,
        fits: percentOfCeiling === null ? null : percentOfCeiling <= 100,
      }
    })

    const broken = rows
      .filter((row) => row.fits === false)
      .sort((left, right) => (right.percentOfCeiling ?? 0) - (left.percentOfCeiling ?? 0))

    return {
      multiplier,
      students: Math.round(currentStudents * multiplier),
      rows,
      firstToBreak: broken[0]?.id ?? null,
    }
  })
}
