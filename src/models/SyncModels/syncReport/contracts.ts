import type { HydratedDocument, Model, Types } from 'mongoose'

export type SyncType = 'hotmart' | 'curseduca' | 'discord' | 'all'
export type ReportStatus = 'success' | 'failed' | 'partial' | 'running'
export type TriggerType = 'MANUAL' | 'CRON' | 'WEBHOOK'

// ─────────────────────────────────────────────────────────────
// INTERFACES
// ─────────────────────────────────────────────────────────────

export interface ISyncReportStats {
  total: number
  inserted: number
  updated: number
  errors: number
  skipped: number
  unchanged: number
}

export interface ISyncReportError {
  timestamp: Date
  message: string
  userId?: string
  userEmail?: string
  stack?: string
  code?: string
}

export interface ISyncReportWarning {
  timestamp: Date
  message: string
  userId?: string
  context?: string
}

export interface ISyncReportConflict {
  userId: string
  userEmail: string
  field: string
  oldValue: unknown
  newValue: unknown
  resolution?: 'auto' | 'manual' | 'pending'
  resolvedAt?: Date
}

export interface ISyncReportSnapshot {
  timestamp: Date
  totalUsers: number
  activeUsers: number
  platformStats: {
    hotmart?: number
    curseduca?: number
    discord?: number
  }
}

export interface ISyncReportPlatformStats {
  hotmart?: {
    processed: number
    inserted: number
    updated: number
    errors: number
  }
  curseduca?: {
    processed: number
    inserted: number
    updated: number
    errors: number
  }
  discord?: {
    processed: number
    inserted: number
    updated: number
    errors: number
  }
}

export interface ISyncReportConfig {
  fullSync: boolean
  includeProgress: boolean
  includeTags: boolean
  batchSize: number
  platforms?: string[]
}

export interface ISyncReportLog {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  meta?: unknown
}

// ─────────────────────────────────────────────────────────────
// BASE DOCUMENT SHAPE (NÃO estende Document)
// ─────────────────────────────────────────────────────────────

export interface ISyncReport {
  // Identificação
  jobId?: Types.ObjectId
  jobName: string
  syncType: SyncType

  // Timing
  startedAt: Date
  completedAt?: Date
  duration: number // em segundos

  // Trigger
  triggeredBy: TriggerType
  triggeredByUser?: Types.ObjectId

  // Status & Results
  status: ReportStatus
  stats: ISyncReportStats

  // Breakdown por plataforma (se syncType = 'all')
  platformStats?: ISyncReportPlatformStats

  // Detalhes de Erros e Avisos
  errors: ISyncReportError[]
  warnings: ISyncReportWarning[]
  conflicts: ISyncReportConflict[]

  // Logs detalhados
  logs: ISyncReportLog[]

  // Snapshots (antes/depois)
  snapshots: {
    before: ISyncReportSnapshot
    after?: ISyncReportSnapshot
  }

  // Configuração usada
  syncConfig: ISyncReportConfig

  // Metadata adicional
  metadata?: {
    apiVersion?: string
    serverVersion?: string
    environment?: string
    requestId?: string
  }

  // timestamps do mongoose (via timestamps: true)
  createdAt: Date
  updatedAt: Date
}

// ─────────────────────────────────────────────────────────────
// METHODS INTERFACE
// ─────────────────────────────────────────────────────────────

export interface ISyncReportMethods {
  addError(error: Omit<ISyncReportError, 'timestamp'>): Promise<this>
  addWarning(warning: Omit<ISyncReportWarning, 'timestamp'>): Promise<this>
  addLog(level: 'info' | 'warn' | 'error' | 'debug', message: string, meta?: unknown): Promise<this>
  markAsComplete(status: 'success' | 'failed' | 'partial'): Promise<this>
  getSuccessRate(): number
  getSummary(): {
    jobName: string
    duration: number
    status: ReportStatus
    successRate: number
    totalProcessed: number
    errorsCount: number
    warningsCount: number
  }
}

export type SyncReportDocument = HydratedDocument<ISyncReport, ISyncReportMethods>

// ─────────────────────────────────────────────────────────────
// STATICS INTERFACE
// ─────────────────────────────────────────────────────────────

export interface ISyncReportStatics {
  findByJob(jobId: string, limit?: number): Promise<SyncReportDocument[]>
  findByType(syncType: SyncType, limit?: number): Promise<SyncReportDocument[]>
  findRecent(limit?: number): Promise<SyncReportDocument[]>

  getAggregatedStats(days?: number): Promise<{
    totalSyncs: number
    successfulSyncs: number
    failedSyncs: number
    avgDuration: number
    totalProcessed: number
    totalErrors: number
  }>

  getLastReportForJob(jobId: string): Promise<SyncReportDocument | null>
}

export interface ISyncReportModel
  extends Model<ISyncReport, Record<string, never>, ISyncReportMethods>,
    ISyncReportStatics {}

// ─────────────────────────────────────────────────────────────
// SUB-SCHEMAS
// ─────────────────────────────────────────────────────────────
