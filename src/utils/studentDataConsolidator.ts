// ══════════════════════════════════════════════════════════════════════
// 📁 src/utils/studentDataConsolidator.ts
// Utilitários para consolidar dados do estudante de múltiplas fontes
// ══════════════════════════════════════════════════════════════════════

import type { IUserProduct } from '../models/UserProduct'
import type { IUserHistory } from '../models/UserHistory'
import type { IStudentEngagementState } from '../models/StudentEngagementState'
import type {
  ConsolidatedClass,
  ProductProgress,
  HotmartProductProgress,
  CurseducaProductProgress,
  ConsolidatedEngagement,
  HotmartEngagement,
  CurseducaEngagement,
  ProductEngagementState,
  StudentStats,
} from '../types/studentComplete'

// ═══════════════════════════════════════════════════════════════
// CONSOLIDAR TURMAS
// ═══════════════════════════════════════════════════════════════

interface StudentStatsUser {
  createdAt?: Date
  metadata: {
    createdAt: Date
  }
  discord?: unknown
}

type StudentProductData = Pick<
  IUserProduct,
  | 'productId'
  | 'productCode'
  | 'productName'
  | 'platform'
  | 'enrolledAt'
  | 'status'
  | 'progress'
  | 'engagement'
  | 'classes'
  | 'isPrimary'
  | 'createdAt'
  | 'updatedAt'
>

type StudentEngagementStateData = Pick<
  IStudentEngagementState,
  | 'productCode'
  | 'currentState'
  | 'daysSinceLastLogin'
  | 'currentLevel'
  | 'currentTagAC'
  | 'stats'
  | 'totalEmailsSent'
  | 'totalReturns'
>

export function consolidateClasses(products: StudentProductData[]): ConsolidatedClass[] {
  const classes: ConsolidatedClass[] = []
  const seen = new Set<string>()

  // Preferir UserProduct como fonte de verdade
  products.forEach((product) => {
    if (product.platform !== 'hotmart' && product.platform !== 'curseduca') return
    const platform = product.platform
    if (!Array.isArray(product.classes)) return
    product.classes.forEach((cls) => {
      const key = `${platform}:${cls.classId}`
      if (seen.has(key)) return
      seen.add(key)
      classes.push({
        classId: cls.classId,
        className: cls.className || `Turma ${cls.classId}`,
        platform,
        source: platform === 'hotmart' ? 'hotmart_sync' : 'curseduca_sync',
        isActive: product.status === 'ACTIVE',
        enrolledAt: cls.joinedAt || product.enrolledAt || null,
      })
    })
  })

  return classes
}

// ═══════════════════════════════════════════════════════════════
// CONSOLIDAR PROGRESSO POR PRODUTO
// ═══════════════════════════════════════════════════════════════

export function consolidateProgressByProduct(
  products: StudentProductData[],
): ProductProgress[] {
  const progressList: ProductProgress[] = []

  // Apenas produtos ativos
  const activeProducts = products.filter((p) => p.status === 'ACTIVE')

  for (const product of activeProducts) {
    const { platform } = product
    const productCode = getProductCode(product)
    const productName = getProductName(product)

    if (platform === 'hotmart') {
      const hotmartProgress = calculateHotmartProgressFromProduct(
        product,
        productCode,
        productName || productCode,
      )
      if (hotmartProgress) {
        progressList.push(hotmartProgress)
      }
    } else if (platform === 'curseduca') {
      const curseducaProgress = calculateCurseducaProgress(product)
      if (curseducaProgress) {
        progressList.push(curseducaProgress)
      }
    }
  }

  return progressList
}

function calculateHotmartProgressFromProduct(
  product: StudentProductData,
  productCode: string,
  productName: string,
): HotmartProductProgress | null {
  const percentage = toNumber(product.progress?.percentage)
  const completedLessons = Array.isArray(product.progress?.lessonsCompleted)
    ? product.progress?.lessonsCompleted.length
    : 0
  const totalLessons = estimateTotalLessons(percentage, completedLessons)
  const totalTimeMinutes = 0
  const recentLessons: HotmartProductProgress['progress']['recentLessons'] = []
  const lastAccessDate =
    (product.progress?.lastActivity as any) ||
    (product.engagement?.lastLogin as any) ||
    null

  // ✅ MÓDULOS - Extrair dados da BD
  const modulesList = Array.isArray(product.progress?.modulesList)
    ? product.progress.modulesList
    : undefined
  const totalModules = product.progress?.totalModules
  const modulesCompleted = Array.isArray(product.progress?.modulesCompleted)
    ? product.progress.modulesCompleted
    : undefined
  const currentModule = product.progress?.currentModule

  return {
    productCode,
    productName,
    platform: 'hotmart',
    progress: {
      completedLessons,
      totalLessons,
      percentage,
      totalTimeMinutes,
      lastAccessDate,
      recentLessons,
      // ✅ MÓDULOS
      modulesList,
      totalModules,
      modulesCompleted,
      currentModule,
    },
  }
}

function calculateCurseducaProgress(product: StudentProductData): CurseducaProductProgress | null {
  const enrolledAt = product.enrolledAt || product.createdAt
  const expiresAt = (product as any).expiresAt || null
  const now = new Date()

  const daysActive = Math.floor((now.getTime() - new Date(enrolledAt).getTime()) / (1000 * 60 * 60 * 24))

  const isExpired = expiresAt ? new Date(expiresAt) < now : false
  const daysUntilExpiry = expiresAt
    ? Math.floor((new Date(expiresAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null

  return {
    productCode: getProductCode(product),
    productName: getProductName(product),
    platform: 'curseduca',
    progress: {
      percentage: toNumber(product.progress?.percentage),
      enrolledAt,
      expiresAt,
      daysActive,
      isExpired,
      daysUntilExpiry,
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// CONSOLIDAR ENGAGEMENT
// ═══════════════════════════════════════════════════════════════

export function consolidateEngagement(
  products: StudentProductData[],
  engagementStates: StudentEngagementStateData[],
): ConsolidatedEngagement {
  const hotmart = getHotmartEngagementFromProducts(products)

  // CursEduca engagement
  const curseduca: CurseducaEngagement | null = calculateCurseducaEngagement(products)

  // Engagement states por produto
  const states: ProductEngagementState[] = engagementStates.map((state) => ({
    productCode: state.productCode,
    currentState: state.currentState,
    daysSinceLastLogin: state.daysSinceLastLogin,
    currentLevel: state.currentLevel || null,
    currentTagAC: state.currentTagAC || null,
    stats: {
      totalDaysInactive: state.stats.totalDaysInactive,
      currentStreakInactive: state.stats.currentStreakInactive,
      longestStreakInactive: state.stats.longestStreakInactive,
    },
    totalEmailsSent: state.totalEmailsSent,
    totalReturns: state.totalReturns,
  }))

  // Overall engagement
  const overall = calculateOverallEngagement(hotmart, curseduca, products)

  return {
    hotmart,
    curseduca,
    states,
    overall,
  }
}

function calculateCurseducaEngagement(
  products: StudentProductData[],
): CurseducaEngagement | null {

  const curseducaProducts = products.filter(
    (p) => p.platform === 'curseduca' && p.status === 'ACTIVE',
  )

  if (curseducaProducts.length === 0) return null

  const progressValues = curseducaProducts.map((p) => toNumber(p.progress?.percentage))
  const progress =
    progressValues.reduce((sum, v) => sum + v, 0) / Math.max(progressValues.length, 1)

  // Calcular enrollment duration (média de todos os produtos)
  const now = new Date().getTime()
  const enrollmentDurations = curseducaProducts.map((p) => {
    const start = p.enrolledAt || p.createdAt
    return Math.floor((now - new Date(start).getTime()) / (1000 * 60 * 60 * 24))
  })
  const avgEnrollmentDuration =
    enrollmentDurations.reduce((sum, d) => sum + d, 0) / enrollmentDurations.length

  // Taxa de progresso (% por dia)
  const progressRate = avgEnrollmentDuration > 0 ? progress / avgEnrollmentDuration : 0

  // Nível baseado em taxa de progresso
  let level: 'ALTO' | 'MEDIO' | 'BAIXO' = 'BAIXO'
  if (progressRate > 2) {
    level = 'ALTO' // >2% por dia
  } else if (progressRate > 0.5) {
    level = 'MEDIO' // >0.5% por dia
  }

  return {
    progress,
    level,
    enrollmentDuration: Math.round(avgEnrollmentDuration),
    progressRate: Math.round(progressRate * 100) / 100,
    lastAccessDate: getLastAccessDateFromProducts(curseducaProducts),
  }
}

function calculateOverallEngagement(
  hotmart: HotmartEngagement | null,
  curseduca: CurseducaEngagement | null,
  products: StudentProductData[],
): {
  level: 'ALTO' | 'MEDIO' | 'BAIXO'
  totalAccessCount: number
  platforms: string[]
} {
  const platforms: string[] = []
  let totalAccessCount = 0

  if (hotmart) {
    platforms.push('hotmart')
    totalAccessCount += hotmart.accessCount
  }

  if (curseduca) {
    platforms.push('curseduca')
    // CursEduca não tem accessCount direto, inferir baseado em progresso
    totalAccessCount += Math.floor(curseduca.progress / 2) // Estimativa: 1 acesso por 2% de progresso
  }

  // Calcular nível overall baseado em média
  const levels = []
  if (hotmart) {
    const hotmartLevel = mapHotmartLevel(hotmart.engagementLevel)
    levels.push(hotmartLevel)
  }
  if (curseduca) {
    levels.push(curseduca.level)
  }

  // Nível mais alto prevalece
  let overallLevel: 'ALTO' | 'MEDIO' | 'BAIXO' = 'BAIXO'
  if (levels.includes('ALTO')) {
    overallLevel = 'ALTO'
  } else if (levels.includes('MEDIO')) {
    overallLevel = 'MEDIO'
  }

  return {
    level: overallLevel,
    totalAccessCount,
    platforms,
  }
}

function mapHotmartLevel(
  level: 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' | 'NONE',
): 'ALTO' | 'MEDIO' | 'BAIXO' {
  if (level === 'MUITO_ALTO' || level === 'ALTO') return 'ALTO'
  if (level === 'MEDIO') return 'MEDIO'
  return 'BAIXO'
}

// ═══════════════════════════════════════════════════════════════
// CALCULAR ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════

export function calculateStudentStats(
  user: StudentStatsUser,
  products: StudentProductData[],
  classes: ConsolidatedClass[],
  history: IUserHistory[],
): StudentStats {
  const now = new Date()

  // Produtos
  const activeProducts = products.filter((p) => p.status === 'ACTIVE')
  const inactiveProducts = products.filter((p) => p.status === 'INACTIVE')

  const productsByPlatform = {
    hotmart: products.filter((p) => p.platform === 'hotmart').length,
    curseduca: products.filter((p) => p.platform === 'curseduca').length,
    discord: 0, // TODO: quando implementar
  }

  // Turmas
  const activeClasses = classes.filter((c) => c.isActive)
  const inactiveClasses = classes.filter((c) => !c.isActive)

  const classesByPlatform = {
    hotmart: classes.filter((c) => c.platform === 'hotmart').length,
    curseduca: classes.filter((c) => c.platform === 'curseduca').length,
  }

  // Atividade
  const memberSince = user.createdAt || user.metadata.createdAt
  const daysSinceMemberSince = Math.floor(
    (now.getTime() - new Date(memberSince).getTime()) / (1000 * 60 * 60 * 24),
  )

  const lastAccessDate = getLastAccessDateFromProducts(products)
  const daysSinceLastAccess = lastAccessDate
    ? Math.floor((now.getTime() - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Histórico
  const totalChanges = history.length
  const lastChange = history.length > 0 ? history[0].changeDate : null

  const changesByType: { [key: string]: number } = {}
  history.forEach((change) => {
    changesByType[change.changeType] = (changesByType[change.changeType] || 0) + 1
  })

  // Plataformas
  const platforms = [...new Set(products.map((p) => p.platform))]
  const hasHotmart = platforms.includes('hotmart')
  const hasCurseduca = platforms.includes('curseduca')
  const hasDiscord = !!user.discord

  return {
    totalProducts: products.length,
    activeProducts: activeProducts.length,
    inactiveProducts: inactiveProducts.length,
    productsByPlatform,

    totalClasses: classes.length,
    activeClasses: activeClasses.length,
    inactiveClasses: inactiveClasses.length,
    classesByPlatform,

    memberSince,
    daysSinceMemberSince,
    lastAccessDate,
    daysSinceLastAccess,

    totalChanges,
    lastChange,
    changesByType,

    platforms,
    hasHotmart,
    hasCurseduca,
    hasDiscord,
  }
}

function getLastAccessDateFromProducts(products: StudentProductData[]): Date | null {
  const dates: Date[] = []
  products.forEach((p) => {
    const last =
      (p.progress?.lastActivity as any) ||
      (p.engagement?.lastLogin as any) ||
      (p.engagement?.lastAction as any)
    if (last) {
      dates.push(new Date(last))
    }
  })

  if (dates.length === 0) return null
  return new Date(Math.max(...dates.map((d) => d.getTime())))
}

function getProductCode(product: StudentProductData): string {
  const productId = product.productId as any
  return productId?.code || product.productCode || String(product.productId)
}

function getProductName(product: StudentProductData): string {
  const productId = product.productId as any
  return productId?.name || product.productName || getProductCode(product)
}

function estimateTotalLessons(percentage: number, completedLessons: number): number {
  if (!percentage || percentage <= 0) return completedLessons
  if (completedLessons <= 0) return 0
  return Math.max(completedLessons, Math.round(completedLessons / (percentage / 100)))
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (value && typeof value === 'object') {
    const estimated = (value as { estimatedProgress?: unknown }).estimatedProgress
    if (typeof estimated === 'number' && Number.isFinite(estimated)) return estimated
  }
  return fallback
}

function getHotmartEngagementFromProducts(products: StudentProductData[]): HotmartEngagement | null {
  const hotmartProducts = products.filter(
    (p) => p.platform === 'hotmart' && p.status === 'ACTIVE',
  )
  if (hotmartProducts.length === 0) return null

  const primary =
    hotmartProducts.find((p) => p.isPrimary) ||
    hotmartProducts.sort(
      (a, b) =>
        toNumber(b.engagement?.engagementScore) - toNumber(a.engagement?.engagementScore),
    )[0]

  const engagementScore = toNumber(primary.engagement?.engagementScore)
  const accessCount = toNumber(primary.engagement?.totalLogins)
  const lastAccessDate =
    (primary.progress?.lastActivity as any) ||
    (primary.engagement?.lastLogin as any) ||
    null

  return {
    accessCount,
    engagementScore,
    engagementLevel: scoreToHotmartLevel(engagementScore),
    calculatedAt: primary.updatedAt || new Date(),
    lastAccessDate,
  }
}

function scoreToHotmartLevel(
  score: number,
): 'MUITO_ALTO' | 'ALTO' | 'MEDIO' | 'BAIXO' | 'MUITO_BAIXO' | 'NONE' {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 25) return 'BAIXO'
  if (score > 0) return 'MUITO_BAIXO'
  return 'NONE'
}
