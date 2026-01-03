// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/universalSync.types.ts
// Types universais para sincronização de todas as plataformas
// ════════════════════════════════════════════════════════════

import { SyncType, TriggerType } from "../models/SyncModels/SyncReport"



// ═══════════════════════════════════════════════════════════
// UNIVERSAL SOURCE ITEM - FONTE ÚNICA DA VERDADE
// ═══════════════════════════════════════════════════════════

/**
 * Interface universal que representa um item de sincronização
 * de QUALQUER plataforma (Hotmart, CursEduca, Discord, etc)
 * 
 * ✅ Esta é a FONTE ÚNICA DA VERDADE para todos os adapters
 * ✅ Todos os adapters retornam UniversalSourceItem[]
 * ✅ Adicionar campos novos AQUI para todas as plataformas
 */
export interface UniversalSourceItem {
  // ═══════════════════════════════════════════════════════════
  // BASE (OBRIGATÓRIO PARA TODAS AS PLATAFORMAS)
  // ═══════════════════════════════════════════════════════════
  email?: string
  name?: string

  // ═══════════════════════════════════════════════════════════
  // IDs GENÉRICOS
  // ═══════════════════════════════════════════════════════════
  id?: string
  userId?: string

  // ═══════════════════════════════════════════════════════════
  // HOTMART
  // ═══════════════════════════════════════════════════════════
  hotmartUserId?: string
  purchaseDate?: Date | string | null
  signupDate?: Date | string | null
  firstAccessDate?: Date | string | null
  lastAccessDate?: Date | string | null
  plusAccess?: string
  classId?: string
  className?: string
  productCode?: string
  currentModule?: number
  
  // ═══════════════════════════════════════════════════════════
  // PLATFORM DATA (COMUM A TODAS AS PLATAFORMAS)
  // ═══════════════════════════════════════════════════════════
  platformData?: {
    isPrimary?: boolean
    isDuplicate?: boolean           // ✅ Para deduplicação
    situation?: string              // ✅ ACTIVE/INACTIVE/SUSPENDED
    enrollmentsCount?: number       // ✅ Quantos produtos o user tem
    [key: string]: unknown
  }
  
  // ═══════════════════════════════════════════════════════════
  // PROGRESS (COMUM A TODAS AS PLATAFORMAS)
  // ═══════════════════════════════════════════════════════════
  progress?: {
    percentage?: number             // Todas as plataformas
    completed?: number              // Hotmart específico
    lessons?: Array<{
      pageId?: string
      pageName?: string
      isCompleted?: boolean
      completedDate?: Date | string | null
    }>
  }
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT (COMUM A TODAS AS PLATAFORMAS)
  // ═══════════════════════════════════════════════════════════
  accessCount?: number | string
  engagementLevel?: string
  
  engagement?: {
    engagementScore?: number
  }

  // ═══════════════════════════════════════════════════════════
  // CURSEDUCA
  // ═══════════════════════════════════════════════════════════
  curseducaUserId?: string
  curseducaUuid?: string
  groupId?: string | number
  groupName?: string
  subscriptionType?: 'MONTHLY' | 'ANNUAL'
  enrolledAt?: Date | string | null
  joinedDate?: Date | string | null
  lastLogin?: string | Date         // ✅ Último login real
  lastAccess?: string | Date        // ✅ Última atividade

  // ═══════════════════════════════════════════════════════════
  // DISCORD
  // ═══════════════════════════════════════════════════════════
  discordUserId?: string
  username?: string
  roles?: string[]

  // ═══════════════════════════════════════════════════════════
  // EXTRA (FLEXIBILIDADE PARA NOVAS PLATAFORMAS)
  // ═══════════════════════════════════════════════════════════
  [key: string]: unknown
}

// ═══════════════════════════════════════════════════════════
// SYNC CONFIGURATION
// ═══════════════════════════════════════════════════════════

export interface UniversalSyncConfig {
  // Identificação
  syncType: SyncType
  jobName: string
  jobId?: string

  // Trigger
  triggeredBy: TriggerType
  triggeredByUser?: string

  // Configurações
  fullSync: boolean
  includeProgress: boolean
  includeTags: boolean
  batchSize: number

  // Dados da fonte
  sourceData: UniversalSourceItem | UniversalSourceItem[]

  // Callbacks opcionais
  onProgress?: (progress: SyncProgress) => void
  onError?: (error: SyncError) => void
  onWarning?: (warning: SyncWarning) => void
}

// ═══════════════════════════════════════════════════════════
// SYNC PROGRESS
// ═══════════════════════════════════════════════════════════

export interface SyncProgress {
  current: number
  total: number
  percentage: number
  message: string
}

// ═══════════════════════════════════════════════════════════
// SYNC ERROR
// ═══════════════════════════════════════════════════════════

export interface SyncError {
  message: string
  userId?: string
  userEmail?: string
  stack?: string
  code?: string
}

// ═══════════════════════════════════════════════════════════
// SYNC WARNING
// ═══════════════════════════════════════════════════════════

export interface SyncWarning {
  message: string
  userId?: string
  context?: string
}

// ═══════════════════════════════════════════════════════════
// PROCESS ITEM RESULT (INTERNAL)
// ═══════════════════════════════════════════════════════════

export interface ProcessItemResult {
  action: 'inserted' | 'updated' | 'unchanged' | 'skipped'
  userId?: string
}

// ═══════════════════════════════════════════════════════════
// SYNC RESULT
// ═══════════════════════════════════════════════════════════

export interface UniversalSyncResult {
  success: boolean
  reportId: string
  syncHistoryId: string
  stats: {
    total: number
    inserted: number
    updated: number
    errors: number
    skipped: number
    unchanged: number
  }
  duration: number
  errors: SyncError[]
  warnings: SyncWarning[]
}