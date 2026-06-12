// ════════════════════════════════════════════════════════════
// 📁 src/services/achievements/achievementEvaluator.ts
// Avalia os 26 triggers de conquistas para um utilizador
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { ACHIEVEMENT_DEFINITIONS, TOTAL_ACHIEVEMENTS } from './achievementDefinitions'
import { calculateStreak, getTrackedStreak, StreakResult } from './streakCalculator'
import UserProduct from '../../models/UserProduct'
import StudentClassHistory from '../../models/StudentClassHistory'
import StudentEngagementState from '../../models/StudentEngagementState'
import { Class } from '../../models/Class'

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────

interface AchievementItem {
  id: string
  unlockedAt: Date | null
  seenAt?: Date | null
  progress?: {
    current: number
    target: number
  }
}

interface AchievementResult {
  achievements: AchievementItem[]
  stats: {
    total: number
    unlocked: number
    percentage: number
    currentStreak: number
    bestStreak: number
    lastEvaluatedAt: Date
  }
}

// Dados do utilizador necessários para avaliação
interface UserData {
  _id: mongoose.Types.ObjectId
  email: string
  discord?: {
    discordIds?: string[]
  }
  hotmart?: {
    purchaseDate?: Date
    signupDate?: Date
    firstAccessDate?: Date
    lastAccessDate?: Date
    enrolledClasses?: Array<{
      classId: string
      className: string
      isActive: boolean
    }>
    progress?: {
      completedLessons: number
      lessonsData?: any[]
    }
    engagement?: {
      engagementLevel?: string
      accessCount?: number
    }
  }
  curseduca?: {
    enrollmentsCount?: number
    memberStatus?: string
  }
  combined?: {
    status?: string
    totalProgress?: number
    engagement?: {
      level?: string
    }
    dataQuality?: string
  }
  engagement?: {
    streak?: {
      current?: number
      best?: number
      lastActiveDay?: string
    }
  }
  inactivation?: {
    reactivatedAt?: Date
    reactivationReason?: string
  }
  // Achievements existentes (para preservar datas de desbloqueio)
  achievements?: AchievementItem[]
  achievementStats?: {
    bestStreak?: number
  }
}

// ─────────────────────────────────────────────────────────────
// AVALIADOR PRINCIPAL
// ─────────────────────────────────────────────────────────────

export async function evaluateAchievements(user: UserData): Promise<AchievementResult> {
  const trackedStreak = getTrackedStreak(user)

  // Carregar dados auxiliares em paralelo
  const [streak, userProduct, classHistoryCount, engagementState, classNames] = await Promise.all([
    trackedStreak ? Promise.resolve(trackedStreak) : calculateStreak(user._id),
    findOgiUserProduct(user._id),
    countClassChanges(user._id),
    findEngagementState(user._id),
    getEnrolledClassNames(user),
  ])

  // Mapa de achievements existentes (para preservar unlockedAt)
  const existingMap = new Map<string, AchievementItem>()
  if (user.achievements) {
    for (const a of user.achievements) {
      existingMap.set(a.id, a)
    }
  }

  // Avaliar cada achievement
  const achievements: AchievementItem[] = ACHIEVEMENT_DEFINITIONS.map((def) => {
    const existing = existingMap.get(def.id)
    const result = evaluateSingle(def.id, user, streak, userProduct, classHistoryCount, engagementState, classNames)

    // Se já estava desbloqueado, manter data original
    if (existing?.unlockedAt) {
      return {
        id: def.id,
        unlockedAt: existing.unlockedAt,
        seenAt: existing.seenAt ?? null,
        progress: result.progress,
      }
    }

    // Novo desbloqueio
    if (result.unlocked && !existing?.unlockedAt) {
      return {
        id: def.id,
        unlockedAt: new Date(),
        seenAt: null,
        progress: result.progress,
      }
    }

    // Não desbloqueado — manter progresso
    return {
      id: def.id,
      unlockedAt: null,
      seenAt: existing?.seenAt ?? null,
      progress: result.progress,
    }
  })

  const unlocked = achievements.filter((a) => a.unlockedAt !== null).length

  return {
    achievements,
    stats: {
      total: TOTAL_ACHIEVEMENTS,
      unlocked,
      percentage: Math.round((unlocked / TOTAL_ACHIEVEMENTS) * 100),
      currentStreak: streak.currentStreak,
      bestStreak: Math.max(streak.bestStreak, user.achievementStats?.bestStreak || 0),
      lastEvaluatedAt: new Date(),
    },
  }
}

// ─────────────────────────────────────────────────────────────
// AVALIAÇÃO INDIVIDUAL
// ─────────────────────────────────────────────────────────────

interface SingleResult {
  unlocked: boolean
  progress?: { current: number; target: number }
}

function evaluateSingle(
  id: string,
  user: UserData,
  streak: StreakResult,
  userProduct: any,
  classHistoryCount: number,
  engagementState: any,
  classNames: string[]
): SingleResult {
  switch (id) {
    // ── Sequência de Acesso ──
    case 'primeiro_login':
      return { unlocked: Boolean(user.hotmart?.firstAccessDate) }

    case 'streak_7_dias':
      return {
        unlocked: streak.bestStreak >= 7,
        progress: { current: Math.min(streak.currentStreak, 7), target: 7 },
      }

    case 'streak_30_dias':
      return {
        unlocked: streak.bestStreak >= 30,
        progress: { current: Math.min(streak.currentStreak, 30), target: 30 },
      }

    case 'streak_100_dias':
      return {
        unlocked: streak.bestStreak >= 100,
        progress: { current: Math.min(streak.currentStreak, 100), target: 100 },
      }

    case 'streak_365_dias':
      return {
        unlocked: streak.bestStreak >= 365,
        progress: { current: Math.min(streak.currentStreak, 365), target: 365 },
      }

    case 'fenix':
      return {
        unlocked: Boolean(
          user.inactivation?.reactivatedAt
          && (user.inactivation.reactivationReason === 'renewal_detected'
            || user.inactivation.reactivationReason === 'manual')
        ),
      }

    // ── Progresso no Curso ──
    case 'primeira_licao': {
      const completed = getCompletedLessons(user, userProduct)
      return { unlocked: completed >= 1 }
    }

    case 'estudante_dedicado': {
      const completed = getCompletedLessons(user, userProduct)
      return {
        unlocked: completed >= 10,
        progress: { current: Math.min(completed, 10), target: 10 },
      }
    }

    case 'meio_caminho': {
      const pct = getProgressPercentage(user, userProduct)
      return {
        unlocked: pct >= 50,
        progress: { current: Math.min(pct, 50), target: 50 },
      }
    }

    case 'quase_la': {
      const pct = getProgressPercentage(user, userProduct)
      return {
        unlocked: pct >= 90,
        progress: { current: Math.min(pct, 90), target: 90 },
      }
    }

    case 'curso_completo': {
      const pct = getProgressPercentage(user, userProduct)
      return { unlocked: pct >= 100 }
    }

    case 'mestre_modulo': {
      const modulesCompleted = getModulesCompleted(userProduct)
      return { unlocked: modulesCompleted >= 1 }
    }

    case 'todos_modulos': {
      const modulesCompleted = getModulesCompleted(userProduct)
      const totalModules = getTotalModules(userProduct)
      return {
        unlocked: totalModules > 0 && modulesCompleted >= totalModules,
      }
    }

    // ── Envolvimento ──
    case 'activo': {
      const level = getEngagementLevel(user)
      return { unlocked: level === 'ALTO' || level === 'MUITO_ALTO' }
    }

    case 'super_activo': {
      const level = getEngagementLevel(user)
      return { unlocked: level === 'MUITO_ALTO' }
    }

    case 'consistente': {
      const weeksActive = userProduct?.engagement?.weeksActiveLast30Days || 0
      return { unlocked: weeksActive >= 4 }
    }

    // ── Turma e Comunidade ──
    case 'riquinho':
      return {
        unlocked: Boolean(user.discord?.discordIds && user.discord.discordIds.length > 0),
      }

    case 'veterano': {
      const days = getDaysSinceEnrollment(user, userProduct)
      return {
        unlocked: days >= 180,
        progress: days < 180 ? { current: days, target: 180 } : undefined,
      }
    }

    case 'pioneiro': {
      // Turma 1, 2 ou 3 — verificar pelo nome da turma
      const isPioneer = classNames.some((name) => {
        const match = name.match(/turma\s+(\d+)/i)
        if (!match) return false
        const num = parseInt(match[1], 10)
        return num >= 1 && num <= 3
      })
      return { unlocked: isPioneer }
    }

    case 'renovador':
      return {
        unlocked: user.inactivation?.reactivationReason === 'renewal_detected',
      }

    case 'multi_produto':
      return {
        unlocked: (user.curseduca?.enrollmentsCount || 0) >= 2,
      }

    case 'mudanca_turma':
      return {
        unlocked: classHistoryCount >= 1,
      }

    // ── Marcos Especiais ──
    case 'madrugador': {
      const purchase = user.hotmart?.purchaseDate
      const firstAccess = user.hotmart?.firstAccessDate
      if (!purchase || !firstAccess) return { unlocked: false }
      const diffMs = new Date(firstAccess).getTime() - new Date(purchase).getTime()
      return { unlocked: diffMs >= 0 && diffMs < 86400000 } // < 24h
    }

    case 'volta_triunfal': {
      const longestInactive = engagementState?.stats?.longestStreakInactive || 0
      const hasReturned = engagementState?.totalReturns > 0
      return { unlocked: longestInactive >= 30 && hasReturned }
    }

    case 'perfil_completo':
      return {
        unlocked: user.combined?.dataQuality === 'EXCELLENT',
      }

    case 'um_ano': {
      const days = getDaysSinceEnrollment(user, userProduct)
      return {
        unlocked: days >= 365,
        progress: days < 365 ? { current: days, target: 365 } : undefined,
      }
    }

    default:
      return { unlocked: false }
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS — Extracção de dados
// ─────────────────────────────────────────────────────────────

function getCompletedLessons(user: UserData, userProduct: any): number {
  return userProduct?.progress?.completed
    || userProduct?.progress?.lessonsCompleted?.length
    || user.hotmart?.progress?.completedLessons
    || 0
}

function getProgressPercentage(user: UserData, userProduct: any): number {
  if (typeof userProduct?.progress?.percentage === 'number') {
    return userProduct.progress.percentage
  }
  return user.combined?.totalProgress || 0
}

function getModulesCompleted(userProduct: any): number {
  if (Array.isArray(userProduct?.progress?.modulesCompleted)) {
    return userProduct.progress.modulesCompleted.length
  }
  if (Array.isArray(userProduct?.progress?.modulesList)) {
    return userProduct.progress.modulesList.filter((m: any) => m.isCompleted).length
  }
  return 0
}

function getTotalModules(userProduct: any): number {
  return userProduct?.progress?.totalModules
    || userProduct?.progress?.modulesList?.length
    || 0
}

function getEngagementLevel(user: UserData): string {
  return user.combined?.engagement?.level
    || user.hotmart?.engagement?.engagementLevel
    || 'NONE'
}

function getDaysSinceEnrollment(user: UserData, userProduct: any): number {
  const enrolledAt = userProduct?.enrolledAt
    || user.hotmart?.purchaseDate
    || user.hotmart?.signupDate

  if (!enrolledAt) return 0

  const diffMs = Date.now() - new Date(enrolledAt).getTime()
  return Math.floor(diffMs / 86400000)
}

// ─────────────────────────────────────────────────────────────
// HELPERS — Queries de dados auxiliares
// ─────────────────────────────────────────────────────────────

async function findOgiUserProduct(userId: mongoose.Types.ObjectId): Promise<any> {
  return (UserProduct as any).findOne({
    userId,
    platform: 'hotmart',
  })
    .sort({ updatedAt: -1 })
    .select('status enrolledAt progress engagement metadata.purchaseDate updatedAt')
    .lean()
    .exec()
}

async function countClassChanges(userId: mongoose.Types.ObjectId): Promise<number> {
  return (StudentClassHistory as any).countDocuments({ studentId: userId }).exec()
}

async function findEngagementState(userId: mongoose.Types.ObjectId): Promise<any> {
  return (StudentEngagementState as any).findOne({ userId })
    .select('stats totalReturns')
    .lean()
    .exec()
}

async function getEnrolledClassNames(user: UserData): Promise<string[]> {
  const classIds = user.hotmart?.enrolledClasses
    ?.filter((c) => c.isActive)
    ?.map((c) => c.classId) || []

  if (classIds.length === 0) return []

  const classes = await (Class as any).find({ classId: { $in: classIds } })
    .select('classId name')
    .lean()
    .exec()

  return classes.map((c: any) => c.name || '')
}
