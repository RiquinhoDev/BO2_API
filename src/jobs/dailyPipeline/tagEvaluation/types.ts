// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/types.ts
// Tipos e Interfaces do Sistema de Tags
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'

export type TagCategory = 'INACTIVITY' | 'ENGAGEMENT' | 'PROGRESS' | 'COMPLETION' | 'ACCOUNT_STATUS' | 'POSITIVE' | 'MODULE_STUCK'
export type ProductName = 'OGI_V1' | 'CLAREZA_ANUAL' | 'CLAREZA_MENSAL' | string

export interface IEngagementMetrics {
  score?: number
  level?: string
  daysInactive?: number
  loginsLast30Days?: number
  weeksActiveLast30Days?: number
  // Platform-specific fields
  daysSinceLastLogin?: number  // OGI/Hotmart
  daysSinceLastAction?: number // CLAREZA/CursEduca
}

export interface IProgressMetrics {
  percentage?: number
  modulesList?: Array<{
    moduleId: string
    name?: string
    sequence?: number
    totalPages?: number
    completedPages?: number
    isCompleted?: boolean
    completed?: boolean  // Alternative field name
    isExtra?: boolean
    progressPercentage?: number
    lastCompletedDate?: number  // timestamp
    completedAt?: Date
  }>
  totalModules?: number
  modulesCompleted?: number | string[]
}

export interface IUserProductForEvaluation {
  _id: mongoose.Types.ObjectId
  userId: mongoose.Types.ObjectId
  productId: mongoose.Types.ObjectId
  status: 'ACTIVE' | 'CANCELLED' | 'SUSPENDED' | 'EXPIRED' | string
  engagement?: IEngagementMetrics
  progress?: IProgressMetrics
  activeCampaignData?: {
    tags?: string[]
    contactId?: string
  }
  metadata?: {
    refunded?: boolean
    refundDate?: Date
  }
  curseduca?: {
    memberStatus?: 'ACTIVE' | 'INACTIVE'
    memberId?: string
  }
  reactivatedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface IUserForEvaluation {
  _id: mongoose.Types.ObjectId
  email: string
  name?: string
  inactivation?: {
    isManuallyInactivated?: boolean
    inactivatedAt?: Date
    inactivatedBy?: string
    reason?: string
  }
}

export interface IProductForEvaluation {
  _id: mongoose.Types.ObjectId
  name: string
  code?: string
}

export interface ITagEvaluationResult {
  userId: mongoose.Types.ObjectId
  email: string
  tags: string[]
  appliedTags: {
    category: TagCategory
    tags: string[]
    reason: string
  }[]
  debug?: {
    engagementScore?: number
    daysInactive?: number
    progress?: number
    productName?: string
  }
}

export interface ITagEvaluationOptions {
  dryRun?: boolean
  verbose?: boolean
  includeDebugInfo?: boolean
}
