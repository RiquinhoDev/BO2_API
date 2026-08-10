import type { IUser } from '../../../models/user'
import type { PlatformType as ProductPlatform } from '../../../models/product/Product'
import { isCurseducaEnrollmentActive } from '../curseducaServices/curseducaMemberships'

export type DataRecord = Readonly<Record<string, unknown>>
export type DateValue = Date | string | number

export interface Stringifiable {
  toString(): string
}

export interface LegacyUserRecord {
  _id: Stringifiable
  name: string
  email: string
  createdAt?: Date
  metadata?: Pick<IUser['metadata'], 'createdAt'>
  hotmart?: IUser['hotmart']
  curseduca?: IUser['curseduca']
  discord?: IUser['discord']
}

export interface ProductRecord {
  _id: Stringifiable
  name: string
  code: string
  platform: ProductPlatform
  isActive: boolean
}

export interface PopulatedUser {
  _id: Stringifiable
  name?: string
  email?: string
}

export interface UnifiedUserProduct {
  _id: Stringifiable | string
  userId: PopulatedUser
  productId: ProductRecord
  platform: string
  platformUserId: string
  status: string
  progress?: {
    percentage?: number
    lastActivity?: DateValue | null
  }
  engagement?: {
    engagementScore?: number
    engagementLevel?: string
    lastAction?: DateValue
  }
  enrolledAt?: DateValue
  source?: string
  isPrimary?: boolean
  _isV1?: boolean
  _platform?: string
  _hasNestedData?: boolean
  _schemaVersion?: string
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔥 CACHE COM WARM-UP E BACKGROUND REFRESH
// ═══════════════════════════════════════════════════════════════════════════
export interface PlatformMapping {
  platform: string
  userIdField: string              // Campo que tem o ID da plataforma
  dataPath: string                 // Caminho para os dados nested
  engagementPath: string           // Caminho para engagement
  progressPath: string             // Caminho para progresso
  statusLogic?: (data: DataRecord) => string      // Lógica custom de status
  progressLogic?: (data: DataRecord) => number    // Lógica custom de progresso
  engagementScoreLogic?: (data: DataRecord) => number  // ✅ NOVO: Engagement score
}

function isRecord(value: unknown): value is DataRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asRecord(value: unknown): DataRecord | undefined {
  return isRecord(value) ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function toTimestamp(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime()
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  return new Date(value).getTime()
}

function calculateHotmartLessonProgress(data: DataRecord): number {
  const progress = asRecord(data.progress)
  const lessons = progress?.lessonsData
  if (!Array.isArray(lessons) || lessons.length === 0) return 0

  const completed = lessons.filter(lesson => asRecord(lesson)?.completed === true).length
  return Math.round((completed / lessons.length) * 100)
}

export const PLATFORM_MAPPINGS: PlatformMapping[] = [
  // ─────────────────────────────────────────────────────────────
  // HOTMART
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'hotmart',
    userIdField: 'hotmart.hotmartUserId',  // ✅ CORRIGIDO (schema atual)
    dataPath: 'hotmart',
    engagementPath: 'hotmart.engagement',
    progressPath: 'hotmart.progress',
    
    statusLogic: (data) => {
      // ✅ HOTMART = LOGIN-BASED
      // Usar lastAccessDate (não lastLogin, Hotmart não tem esse campo)
      const progress = asRecord(data.progress)
      const lastAccessTimestamp = toTimestamp(progress?.lastAccessDate)
      if (lastAccessTimestamp === undefined) return 'INACTIVE'
      
      const daysSince = (Date.now() - lastAccessTimestamp) / (1000 * 60 * 60 * 24)
      return daysSince > 30 ? 'INACTIVE' : 'ACTIVE'
    },
    
    progressLogic: calculateHotmartLessonProgress,
    
    engagementScoreLogic: (data) => {
      // ✅ Usar accessCount do engagement
      const engagement = asRecord(data.engagement)
      return asFiniteNumber(engagement?.accessCount) ?? 0
    }
  },
  
  // ─────────────────────────────────────────────────────────────
  // CURSEDUCA
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'curseduca',
    userIdField: 'curseduca.curseducaUserId',
    dataPath: 'curseduca',
    engagementPath: 'curseduca.progress',  // ✅ CORRIGIDO (curseduca não tem .engagement)
    progressPath: 'curseduca.progress',
    
    statusLogic: (data) => {
      // ✅ CURSEDUCA = ACTION-BASED
      // 1. Verificar situation (ACTIVE/INACTIVE/SUSPENDED)
      if (!isCurseducaEnrollmentActive(data.situation)) {
        return 'INACTIVE'
      }
      
      // 2. Verificar lastLogin (se >30 dias = INACTIVE)
      const lastLoginTimestamp = toTimestamp(data.lastLogin)
      if (lastLoginTimestamp === undefined) return 'INACTIVE'
      
      const daysSince = (Date.now() - lastLoginTimestamp) / (1000 * 60 * 60 * 24)
      return daysSince > 30 ? 'INACTIVE' : 'ACTIVE'
    },
    
    progressLogic: (data) => {
      // ✅ Usar estimatedProgress
      const progress = asRecord(data.progress)
      return asFiniteNumber(progress?.estimatedProgress) ?? 0
    },
    
    engagementScoreLogic: (data) => {
      // ✅ CursEduca não tem engagement direto, calcular baseado em progresso
      const progressData = asRecord(data.progress)
      const progress = asFiniteNumber(progressData?.estimatedProgress) ?? 0
      return Math.min(100, progress * 2) // Progresso de 50% = engagement de 100
    }
  },
  
  // ─────────────────────────────────────────────────────────────
  // DISCORD
  // ─────────────────────────────────────────────────────────────
  {
    platform: 'discord',
    userIdField: 'discord.discordIds',  // Array de IDs
    dataPath: 'discord',
    engagementPath: 'discord',
    progressPath: 'discord',
    
    statusLogic: (data) => {
      return data.isDeleted ? 'INACTIVE' : 'ACTIVE'
    },
    
    progressLogic: () => 0,  // Discord não tem progresso mensurável
    
    engagementScoreLogic: () => 0  // Discord não tem engagement score
  }
  
  // ─────────────────────────────────────────────────────────────
  // 🆕 ADICIONAR NOVAS PLATAFORMAS AQUI
  // ─────────────────────────────────────────────────────────────
]

/**
 * Helper: Obter valor de campo nested usando path
 */
export function getNestedValue(obj: unknown, path: string): unknown {
  let current = obj
  for (const key of path.split('.')) {
    const record = asRecord(current)
    if (!record) return undefined
    current = record[key]
  }
  return current
}

export function stringifyId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value)

  const record = asRecord(value)
  if (record?._id !== undefined) return stringifyId(record._id)

  if (
    typeof value === 'object'
    && value !== null
    && 'toString' in value
    && typeof value.toString === 'function'
  ) {
    return value.toString()
  }

  return undefined
}

export function firstFiniteNumber(...values: unknown[]): number {
  for (const value of values) {
    const number = asFiniteNumber(value)
    if (number !== undefined && number !== 0) return number
  }
  return 0
}

export function firstDateValue(...values: unknown[]): DateValue | undefined {
  for (const value of values) {
    if (value instanceof Date) return value
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number' && value !== 0) return value
  }
  return undefined
}

/**
 * Helper: Calcular engagement level baseado em score
 */
export function calculateEngagementLevel(score: number): string {
  if (score >= 80) return 'MUITO_ALTO'
  if (score >= 60) return 'ALTO'
  if (score >= 40) return 'MEDIO'
  if (score >= 25) return 'BAIXO'
  return 'MUITO_BAIXO'
}

/**
 * 🔄 DUAL READ: Combina dados V1 (User) + V2 (UserProduct)
 * 
 * ARQUITETURA ESCALÁVEL:
 * 1. Busca TODOS os produtos da BD
 * 2. Para cada user, itera por TODAS as plataformas definidas em PLATFORM_MAPPINGS
 * 3. Se user tem ID da plataforma → cria UserProduct (MESMO sem dados nested)
 * 4. Sistema funciona com quantos produtos quiseres adicionar
 */
