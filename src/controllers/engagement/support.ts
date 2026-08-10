// ✅ CACHE OTIMIZADO (NOVO) - apenas adiciona cache às funções existentes
export class EngagementStatsCache<T> {
  private cache = new Map<string, { data: T; timestamp: number }>()
  private readonly TTL = 300000 // 5 minutos (increased since aggregation is fast)

  get(key: string): { data: T; timestamp: number } | null {
    const item = this.cache.get(key)
    if (!item) return null

    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key)
      return null
    }

    return item
  }

  set(key: string, data: T): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  clear(): void {
    this.cache.clear()
  }

  getSize(): number {
    return this.cache.size
  }
}

// ✅ INTERFACE PARA ESTATÍSTICAS DE ENGAGEMENT (MANTIDA)
export interface EngagementStats {
  totalUsers: number
  averageScore: number
  distribution: {
    MUITO_BAIXO: number
    BAIXO: number
    MEDIO: number
    ALTO: number
    MUITO_ALTO: number
  }
  topPerformersCount: number
  needsAttentionCount: number
  platformStats: {
    hotmartUsers: number
    discordUsers: number
    curseducaUsers: number
    activeUsers: number
    inactiveUsers: number
  }
}

export type EngagementLevel = keyof EngagementStats['distribution']

export interface EngagementUserDetails {
  _id: unknown
  name?: string
  email?: string
  status?: string
  classId?: string
  engagementScore: number
  engagement: string
  accessCount: number
  progress: {
    completed: number
    total: number
    completedPercentage: number
  }
  groupName?: string | null
  hotmartUserId?: string | null
  curseducaUserId?: string | null
  lastAccessDate?: Date | string | null
  discordIds?: string[]
  discordUsername?: string | null
}

export interface EngagementFacetResult {
  totalCount: Array<{ total: number }>
  paginatedData: EngagementUserDetails[]
}

export interface EngagementSummaryUser {
  engagementScore: number
}

export interface EngagementLevelStat {
  _id: unknown
  count: number
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isEngagementLevel(value: unknown): value is EngagementLevel {
  return typeof value === 'string'
    && ['MUITO_ALTO', 'ALTO', 'MEDIO', 'BAIXO', 'MUITO_BAIXO'].includes(value)
}

export const statsCache = new EngagementStatsCache<EngagementStats>()

// ✅ CONTROLADOR PRINCIPAL - ESTATÍSTICAS GLOBAIS (MANTIDO - com cache adicionado)
