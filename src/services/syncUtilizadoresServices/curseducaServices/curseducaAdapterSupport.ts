import logger from '../../../utils/logger'
import axios from 'axios'
import { UniversalSourceItem } from '../../../types/universalSync.types'
import {
  CursEducaMemberFromReports,
  CursEducaMemberWithMetadata
} from '../../../types/curseduca.types'
import { getCurseducaRuntimeSettings } from '../../requestDrivenRuntimeConfig'
export const curseducaApiUrl = () => getCurseducaRuntimeSettings().apiUrl
export const CURSEDUCA_CONTENTS_API_URL="https://clas.curseduca.pro"
export const curseducaApiKey = () => getCurseducaRuntimeSettings().apiKey
export const curseducaAccessToken = () => getCurseducaRuntimeSettings().accessToken

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: VALIDAR CREDENCIAIS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function getRequestHeaders(): Record<string, string> {
  const missing: string[] = []
  
  if (!curseducaApiUrl()) missing.push('CURSEDUCA_API_URL')
  if (!curseducaAccessToken()) missing.push('CURSEDUCA_AccessToken')
  if (!curseducaApiKey()) missing.push('CURSEDUCA_API_KEY')
  
  if (missing.length > 0) {
    throw new Error(
      `âŒ Credenciais CursEduca nÃ£o configuradas no arranque:\n` +
      `   Faltam: ${missing.join(', ')}\n` +
      `   Verifique a configuraÃ§Ã£o do ambiente de arranque`
    )
  }

  if (!curseducaAccessToken() || !curseducaApiKey()) {
    throw new Error('Credenciais CursEduca invÃ¡lidas')
  }

  return {
    'Authorization': `Bearer ${curseducaAccessToken()}`,
    'api_key': curseducaApiKey(),
    'Content-Type': 'application/json'
  }
}
export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

export function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro desconhecido'
}

export function errorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

export interface CollectionMetadata {
  hasMore?: boolean
  hasmore?: boolean
  totalCount?: number
}

export interface CollectionResponse<T> {
  data?: T[]
  groups?: T[]
  members?: T[]
  metadata?: CollectionMetadata
}

export type CollectionPayload<T> = T[] | CollectionResponse<T>

export function collectionItems<T>(payload: CollectionPayload<T>): T[] {
  if (Array.isArray(payload)) return payload
  return payload.data ?? payload.groups ?? payload.members ?? []
}

export function collectionMetadata<T>(payload: CollectionPayload<T>): CollectionMetadata {
  return Array.isArray(payload) ? {} : payload.metadata ?? {}
}

export interface CursEducaRosterMember {
  id: number
  uuid: string
  name: string
  email: string
  enteredAt?: string
  expiresAt?: string | null
}

export interface UnifiedCurseducaMember {
  id: number
  uuid: string
  name: string
  email: string
  enteredAt?: string
  expiresAt?: string | null
  progress: number
  enrollmentsCount: number
  groups: CursEducaMemberFromReports['groups']
  lastLogin?: string
  lastAccess?: string
  accessCount?: number
}

export interface BulkCurseducaMember {
  id?: number
  situation?: string
  lastAccess?: string
  groups?: Array<{ groupId?: number }>
}

export interface CurseducaEnrollment {
  content?: { id?: number }
  startedAt?: string
  progress?: number
  finishedAt?: string
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: DEDUPLICAÃ‡ÃƒO INTELIGENTE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function deduplicateMembers(
  members: CursEducaMemberWithMetadata[]
): CursEducaMemberWithMetadata[] {
  logger.info(`ðŸ“Š [Dedupe] Processando ${members.length} membros...`)

  const byEmail = new Map<string, CursEducaMemberWithMetadata[]>()

  for (const member of members) {
    const email = member.email.toLowerCase().trim()
    if (!byEmail.has(email)) byEmail.set(email, [])
    byEmail.get(email)!.push(member)
  }

  logger.info(`   ðŸ“§ ${byEmail.size} emails Ãºnicos`)

  const result: CursEducaMemberWithMetadata[] = []
  let duplicateCount = 0

  for (const [email, userProducts] of byEmail.entries()) {
    if (userProducts.length === 1) {
      userProducts[0].isPrimary = true
      userProducts[0].isDuplicate = false
      result.push(userProducts[0])
    } else {
      duplicateCount++

      userProducts.sort((a, b) => {
        const dateA = a.enrolledAt ? new Date(a.enrolledAt).getTime() : 0
        const dateB = b.enrolledAt ? new Date(b.enrolledAt).getTime() : 0
        return dateB - dateA
      })

      userProducts[0].isPrimary = true
      userProducts[0].isDuplicate = true

      for (let i = 1; i < userProducts.length; i++) {
        userProducts[i].isPrimary = false
        userProducts[i].isDuplicate = true
      }

      result.push(...userProducts)

      logger.info(
        `   ðŸ” ${email}: ${userProducts.length} produtos ` +
        `(primÃ¡rio: ${userProducts[0].subscriptionType})`
      )
    }
  }

  logger.info(`   âœ… ${duplicateCount} users com mÃºltiplos produtos`)
  logger.info(`   ðŸ“¦ Total de produtos: ${result.length}`)

  return result
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: DETECTAR TIPO DE SUBSCRIÃ‡ÃƒO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function detectSubscriptionType(groupName: string): 'MONTHLY' | 'ANNUAL' {
  const nameLower = groupName.toLowerCase()
  
  if (nameLower.includes('mensal') || nameLower.includes('monthly')) {
    return 'MONTHLY'
  }
  
  if (nameLower.includes('anual') || nameLower.includes('annual') || nameLower.includes('yearly')) {
    return 'ANNUAL'
  }
  
  return 'MONTHLY'
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: VALIDAR MEMBRO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function validateCurseducaMember(
  member: Pick<UnifiedCurseducaMember, 'id' | 'name' | 'email'>
): void {
  if (!member.email || !member.email.trim()) {
    throw new Error('Email Ã© obrigatÃ³rio')
  }
  
  if (!member.id) {
    throw new Error('ID do membro Ã© obrigatÃ³rio')
  }
  
  if (!member.name || !member.name.trim()) {
    throw new Error('Nome do membro Ã© obrigatÃ³rio')
  }
}

// âœ… ValidaÃ§Ã£o para CursEducaMemberWithMetadata
export function validateCurseducaMemberExtended(
  member: CursEducaMemberWithMetadata
): void {
  if (!member.email || !member.email.trim()) {
    throw new Error('Email Ã© obrigatÃ³rio')
  }
  
  if (!member.id) {
    throw new Error('ID do membro Ã© obrigatÃ³rio')
  }
  
  if (!member.name || !member.name.trim()) {
    throw new Error('Nome do membro Ã© obrigatÃ³rio')
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: NORMALIZAR MEMBRO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export function normalizeCurseducaMember(
  member: CursEducaMemberWithMetadata
): UniversalSourceItem {
  const email = normalizeEmail(member.email)
  const name = member.name.trim() || email
  const lastAccess = member.lastAccess || member.lastLogin
  const lastLogin = member.lastLogin || member.lastAccess
  const progressScore = member.progress ? Math.min(100, member.progress * 2) : 0
  const accessScore = member.accessCount ? Math.min(100, member.accessCount * 5) : 0
  const engagementScore = Math.max(progressScore, accessScore)
  
  return {
    email,
    name,
    curseducaUserId: member.id.toString(),
    curseducaUuid: member.uuid,
    groupId: member.groupId.toString(),
    groupName: member.groupName,
    subscriptionType: member.subscriptionType,
    lastAccess,
    lastLogin,
    accessCount: member.accessCount,
    enrolledAt: member.enrolledAt ? new Date(member.enrolledAt) : new Date(),
    joinedDate: member.enrolledAt ? new Date(member.enrolledAt) : new Date(),
    expiresAt: member.expiresAt ? new Date(member.expiresAt) : undefined,
    progress: {
      percentage: member.progress || 0,
      completed: 0,
      lessons: []
    },
    engagement: {
      engagementScore
    },
    platformData: {
      isPrimary: member.isPrimary || false,
      isDuplicate: member.isDuplicate || false,
      enrollmentsCount: member.enrollmentsCount || 0,
      situation: member.situation || 'ACTIVE'
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FETCH: LISTA DE MEMBROS (COM PROGRESSO)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

