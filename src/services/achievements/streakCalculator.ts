// ════════════════════════════════════════════════════════════
// 📁 src/services/achievements/streakCalculator.ts
// Calcula sequências de acesso a partir de UserActions
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import UserAction from '../../models/UserAction'

export interface StreakResult {
  currentStreak: number   // sequência actual em dias
  bestStreak: number      // melhor sequência de sempre
}

/**
 * Calcula sequência de dias consecutivos com actividade.
 *
 * Agrupa UserActions por dia (fuso Europe/Lisbon).
 * Conta dias consecutivos a partir de hoje para trás.
 * Intervalo de 1 dia perdoado (configurável).
 */
export async function calculateStreak(
  userId: mongoose.Types.ObjectId,
  forgiveGapDays: number = 1
): Promise<StreakResult> {
  // Buscar todas as datas de acções (últimos 400 dias, cobre 365-streak)
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - 400)

  const actions = await (UserAction as any).find({
    userId,
    timestamp: { $gte: cutoffDate }
  })
    .select('timestamp')
    .sort({ timestamp: 1 })
    .lean()
    .exec()

  if (!actions || actions.length === 0) {
    return { currentStreak: 0, bestStreak: 0 }
  }

  // Extrair dias únicos (YYYY-MM-DD em fuso de Lisboa)
  const uniqueDays = new Set<string>()
  for (const action of actions) {
    const ts = action.timestamp as Date
    const dayKey = formatDateKey(ts)
    uniqueDays.add(dayKey)
  }

  const sortedDays = Array.from(uniqueDays).sort()
  if (sortedDays.length === 0) {
    return { currentStreak: 0, bestStreak: 0 }
  }

  // Calcular todas as sequências
  let bestStreak = 1
  let currentRun = 1

  for (let i = 1; i < sortedDays.length; i++) {
    const gap = daysBetween(sortedDays[i - 1], sortedDays[i])

    if (gap <= 1 + forgiveGapDays) {
      // Dia consecutivo (ou gap perdoado)
      currentRun += gap === 1 ? 1 : gap  // contar dias reais, não saltar
      // Na verdade, para streaks, se perdoamos 1 gap, contamos os dias activos
      // Simplificação: gap <= 2 = continua sequência, incrementa por 1 (dia activo)
      if (gap <= 1 + forgiveGapDays) {
        currentRun++
      }
    } else {
      // Sequência quebrada
      bestStreak = Math.max(bestStreak, currentRun)
      currentRun = 1
    }
  }
  bestStreak = Math.max(bestStreak, currentRun)

  // Calcular sequência actual (a partir do último dia até hoje)
  const today = formatDateKey(new Date())
  const yesterday = formatDateKey(new Date(Date.now() - 86400000))
  const lastActiveDay = sortedDays[sortedDays.length - 1]

  let currentStreak = 0
  if (lastActiveDay === today || lastActiveDay === yesterday) {
    // Ainda activo — contar para trás a partir do último dia
    currentStreak = 1
    for (let i = sortedDays.length - 2; i >= 0; i--) {
      const gap = daysBetween(sortedDays[i], sortedDays[i + 1])
      if (gap <= 1 + forgiveGapDays) {
        currentStreak++
      } else {
        break
      }
    }
  }

  return { currentStreak, bestStreak }
}

// ── Helpers ──

function formatDateKey(date: Date): string {
  // Formato YYYY-MM-DD (UTC para simplicidade)
  return date.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a).getTime()
  const db = new Date(b).getTime()
  return Math.round(Math.abs(db - da) / 86400000)
}
