// ════════════════════════════════════════════════════════════
// 📁 curseduca.types.ts
// Types específicos para integração CursEduca API
// ════════════════════════════════════════════════════════════

// ✅ NÃO importar UniversalSourceItem aqui - usar no adapter diretamente

// ═══════════════════════════════════════════════════════════
// ADAPTER - CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════

export interface CurseducaSyncOptions {
  includeProgress: boolean
  includeGroups: boolean
  groupId?: string
  progressConcurrency?: number
  enrichWithDetails?: boolean
}

// ═══════════════════════════════════════════════════════════
// API RESPONSES - GROUPS
// ═══════════════════════════════════════════════════════════

export interface CursEducaGroup {
  id: number
  uuid?: string
  name: string
  description?: string
}

// ═══════════════════════════════════════════════════════════
// API RESPONSES - /reports/group/members
// ═══════════════════════════════════════════════════════════

export interface CursEducaMemberFromReports {
  id: number
  uuid: string
  name: string
  email: string
  expiresAt: string | null
  enrollmentsCount: number
  progress: number
  activeContents?: number[]
  groups: Array<{
    id: number
    uuid: string
    name: string
  }>
}

// ═══════════════════════════════════════════════════════════
// API RESPONSES - /members/{id}
// ═══════════════════════════════════════════════════════════

export interface CursEducaMemberDetails {
  id: number
  uuid: string
  name: string
  email: string
  situation: string
  lastLogin?: string
  createdAt: string
  updatedAt: string
  groups: Array<{
    group: {
      id: number
      name: string
      expiresAt: string | null
    }
    externalReference: string | null
    createdAt: string
  }>
  document?: string
  phone?: string
  isAdmin?: boolean
  slug?: string
  headline?: string | null
  description?: string
  image?: string | null
  path?: string | null
  tags?: string[]
}

// ═══════════════════════════════════════════════════════════
// INTERNAL - COMBINADO (DOS 2 ENDPOINTS)
// ═══════════════════════════════════════════════════════════

export interface CursEducaMemberWithMetadata {
  id: number
  uuid: string
  name: string
  email: string
  progress: number
  enrollmentsCount: number
  situation?: string
  lastLogin?: string
  groupId: number
  groupName: string
  subscriptionType: 'MONTHLY' | 'ANNUAL'
  enrolledAt: string
  expiresAt?: string | null
  isPrimary?: boolean
  isDuplicate?: boolean
}

// ═══════════════════════════════════════════════════════════
// SYNC SERVICE - INTERFACES
// ═══════════════════════════════════════════════════════════

export interface CurseducaSyncData {
  email: string
  groupId: string
  name?: string
  curseducaUserId?: string
  curseducaUuid?: string
  progress?: number
  enrollmentDate?: string | Date
  lastAccess?: string | Date
  lastLogin?: string | Date
  situation?: string
  enrollmentsCount?: number
  subscriptionType?: 'MONTHLY' | 'ANNUAL'
  isPrimary?: boolean
}

export interface SyncResult {
  success: boolean
  stats: {
    total: number
    created: number
    updated: number
    skipped: number
    errors: number
  }
  errors?: Array<{ email: string; error: string }>
}