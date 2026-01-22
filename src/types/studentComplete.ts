// ══════════════════════════════════════════════════════════════════════
// 📁 src/types/studentComplete.ts
// Types para o endpoint consolidado de dados completos do estudante
// ══════════════════════════════════════════════════════════════════════

import { Types } from 'mongoose'

// ═══════════════════════════════════════════════════════════════
// PROGRESSO POR PRODUTO
// ═══════════════════════════════════════════════════════════════

export interface HotmartProductProgress {
  productCode: string
  productName: string
  platform: 'hotmart'
  progress: {
    completedLessons: number
    totalLessons: number
    percentage: number
    totalTimeMinutes: number
    lastAccessDate: Date | null
    recentLessons: Array<{
      lessonId: string
      title: string
      completedAt: Date
      timeSpent: number
    }>
    // ✅ MÓDULOS
    modulesList?: Array<{
      moduleId: string
      name: string
      sequence: number
      totalPages: number
      completedPages: number
      isCompleted: boolean
      isExtra: boolean
      progressPercentage: number
      lastCompletedDate?: number
    }>
    totalModules?: number
    modulesCompleted?: string[]
    currentModule?: number
  }
}

export interface CurseducaProductProgress {
  productCode: string
  productName: string
  platform: 'curseduca'
  progress: {
    percentage: number
    enrolledAt: Date
    expiresAt: Date | null
    daysActive: number
    isExpired: boolean
    daysUntilExpiry: number | null
  }
}

export type ProductProgress = HotmartProductProgress | CurseducaProductProgress

// ═══════════════════════════════════════════════════════════════
// ENGAGEMENT POR PLATAFORMA
// ═══════════════════════════════════════════════════════════════

export interface HotmartEngagement {
  accessCount: number
  engagementScore: number
  engagementLevel: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' | 'NONE'
  calculatedAt: Date
  lastAccessDate: Date | null
}

export interface CurseducaEngagement {
  progress: number
  level: 'ALTO' | 'MEDIO' | 'BAIXO'
  enrollmentDuration: number
  progressRate: number
  lastAccessDate: Date | null
}

export interface ProductEngagementState {
  productCode: string
  currentState: 'ACTIVE' | 'AT_RISK' | 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' | 'LOST'
  daysSinceLastLogin: number
  currentLevel: number | null
  currentTagAC: string | null
  stats: {
    totalDaysInactive: number
    currentStreakInactive: number
    longestStreakInactive: number
  }
  totalEmailsSent: number
  totalReturns: number
}

export interface ConsolidatedEngagement {
  hotmart: HotmartEngagement | null
  curseduca: CurseducaEngagement | null
  states: ProductEngagementState[]
  overall: {
    level: 'ALTO' | 'MEDIO' | 'BAIXO'
    totalAccessCount: number
    platforms: string[]
  }
}

// ═══════════════════════════════════════════════════════════════
// TURMAS CONSOLIDADAS
// ═══════════════════════════════════════════════════════════════

export interface ConsolidatedClass {
  classId: string
  className: string
  platform: 'hotmart' | 'curseduca'
  source: 'hotmart_sync' | 'curseduca_sync'
  isActive: boolean
  enrolledAt: Date | null
  expiresAt?: Date | null
  role?: string
}

// ═══════════════════════════════════════════════════════════════
// ESTATÍSTICAS DO ESTUDANTE
// ═══════════════════════════════════════════════════════════════

export interface StudentStats {
  // Produtos
  totalProducts: number
  activeProducts: number
  inactiveProducts: number
  productsByPlatform: {
    hotmart: number
    curseduca: number
    discord: number
  }

  // Turmas
  totalClasses: number
  activeClasses: number
  inactiveClasses: number
  classesByPlatform: {
    hotmart: number
    curseduca: number
  }

  // Atividade
  memberSince: Date
  daysSinceMemberSince: number
  lastAccessDate: Date | null
  daysSinceLastAccess: number | null

  // Histórico
  totalChanges: number
  lastChange: Date | null
  changesByType: {
    [key: string]: number
  }

  // Plataformas
  platforms: string[]
  hasHotmart: boolean
  hasCurseduca: boolean
  hasDiscord: boolean
}

// ═══════════════════════════════════════════════════════════════
// RESPOSTA COMPLETA
// ═══════════════════════════════════════════════════════════════

export interface StudentCompleteResponse {
  success: boolean
  data: {
    // Dados base do user
    user: any // IUser do modelo

    // Produtos
    products: any[] // IUserProduct[]

    // Turmas consolidadas
    classes: ConsolidatedClass[]

    // Progresso por produto
    progressByProduct: ProductProgress[]

    // Engagement consolidado
    engagement: ConsolidatedEngagement

    // Histórico
    history: any[] // IUserHistory[]

    // Estatísticas
    stats: StudentStats
  }
  meta: {
    executionTime: number
    queriesCount: number
    recordsReturned: {
      products: number
      classes: number
      history: number
      engagementStates: number
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ERROS
// ═══════════════════════════════════════════════════════════════

export class StudentNotFoundError extends Error {
  constructor(userId: string) {
    super(`Student with ID ${userId} not found`)
    this.name = 'StudentNotFoundError'
  }
}

export class StudentDataFetchError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message)
    this.name = 'StudentDataFetchError'
  }
}
