// src/services/historyService.ts
import { UserHistory } from '../models/UserHistory'

interface HistoryEntry {
  userId: string
  adminId: string
  action: string
  field: string
  oldValue: any
  newValue: any
  platform?: 'hotmart' | 'curseduca' | 'discord' | 'system'
  metadata?: any
}

export const createHistoryEntry = async (entry: HistoryEntry) => {
  try {
    await UserHistory.create({
      ...entry,
      timestamp: new Date()
    })
  } catch (error) {
    console.error('Erro ao criar entrada de histórico:', error)
  }
}

// ✅ Registar alterações em campos de plataforma específica
export const trackPlatformChange = async (
  userId: string,
  adminId: string,
  platform: 'hotmart' | 'curseduca' | 'discord',
  field: string,
  oldValue: any,
  newValue: any
) => {
  await createHistoryEntry({
    userId,
    adminId,
    action: 'update',
    field: `${platform}.${field}`,
    oldValue,
    newValue,
    platform,
    metadata: {
      source: 'manual_edit',
      timestamp: new Date()
    }
  })
}

// ✅ Obter histórico unificado de um utilizador
export const getUserUnifiedHistory = async (userId: string) => {
  const history = await UserHistory.find({ userId })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean()

  // Agrupar por plataforma
  const grouped = {
    hotmart: history.filter(h => h.platform === 'hotmart'),
    curseduca: history.filter(h => h.platform === 'curseduca'),
    discord: history.filter(h => h.platform === 'discord'),
    system: history.filter(h => h.platform === 'system' || !h.platform)
  }

  return {
    all: history,
    byPlatform: grouped
  }
}