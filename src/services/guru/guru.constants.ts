// src/services/guru/guru.constants.ts
// Constantes e helpers partilhados para toda a integração Guru/CursEduca
// TODAS as classificações de status devem vir daqui - NUNCA definir localmente

import axios from 'axios'

// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO CURSEDUCA (centralizada)
// ═══════════════════════════════════════════════════════════

export const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL || 'https://prof.curseduca.pro'
export const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY || 'ce9ef2a4afef727919473d38acafe10109c4faa8'
export const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_ACCESS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds'

// ═══════════════════════════════════════════════════════════
// STATUS GURU
// ═══════════════════════════════════════════════════════════

/** Status que indicam cancelamento definitivo */
export const GURU_CANCELED_STATUSES = ['canceled', 'expired', 'refunded']

/** Status que indicam subscrição legitimamente ativa */
export const GURU_ACTIVE_STATUSES = ['active', 'pastdue']

/** Threshold em dias para considerar um pending como "fantasma" */
export const PENDING_STALE_THRESHOLD_DAYS = 7

// ═══════════════════════════════════════════════════════════
// STATUS CURSEDUCA
// ═══════════════════════════════════════════════════════════

export const CURSEDUCA_CANCELED_STATUSES = ['CANCELLED', 'INACTIVE', 'SUSPENDED']
export const CURSEDUCA_ACTIVE_STATUSES = ['ACTIVE']

// ═══════════════════════════════════════════════════════════
// PRIORIDADE DE STATUS (para múltiplas subscrições)
// ═══════════════════════════════════════════════════════════

/** Prioridade base - menor = melhor. Pending é calculado dinamicamente. */
const BASE_STATUS_PRIORITY: Record<string, number> = {
  'active': 1,
  'pastdue': 2,
  'pending': 3,    // Default para pending fresh (< 7 dias)
  'suspended': 4,
  'canceled': 5,
  'expired': 6,
  'refunded': 7
}

/** Prioridade de pending stale - PIOR que refunded */
const STALE_PENDING_PRIORITY = 8

// ═══════════════════════════════════════════════════════════
// HELPERS: PENDING STALE DETECTION
// ═══════════════════════════════════════════════════════════

export interface GuruDateInfo {
  updatedAt?: Date | string | null
  nextCycleAt?: Date | string | null
  startedAt?: Date | string | null
}

/**
 * Verificar se uma subscrição pending é "fantasma" (stale)
 * Uma sub pending é stale se:
 * - Tem mais de PENDING_STALE_THRESHOLD_DAYS dias desde a última atualização
 * - E não tem nextCycleAt ou nextCycleAt já passou
 */
export function isPendingStale(dates?: GuruDateInfo | null): boolean {
  if (!dates) return true // Sem datas = assumir stale

  const now = new Date()
  const thresholdMs = PENDING_STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000

  // Verificar updatedAt / startedAt
  const lastDate = dates.updatedAt || dates.startedAt
  if (lastDate) {
    const dateObj = lastDate instanceof Date ? lastDate : new Date(lastDate)
    if (!isNaN(dateObj.getTime())) {
      const daysSince = now.getTime() - dateObj.getTime()
      if (daysSince <= thresholdMs) {
        return false // Atualizado recentemente - é fresh
      }
    }
  }

  // Se chegou aqui, é antigo. Verificar nextCycleAt
  if (dates.nextCycleAt) {
    const nextCycle = dates.nextCycleAt instanceof Date ? dates.nextCycleAt : new Date(dates.nextCycleAt)
    if (!isNaN(nextCycle.getTime()) && nextCycle.getTime() > now.getTime()) {
      return false // Tem próximo ciclo no futuro - é fresh
    }
  }

  return true // Antigo e sem próximo ciclo válido = stale
}

// ═══════════════════════════════════════════════════════════
// HELPERS: STATUS CLASSIFICATION
// ═══════════════════════════════════════════════════════════

export interface EffectiveStatus {
  isActive: boolean
  isCanceled: boolean
  isPending: boolean
  isPendingStale: boolean
  effectiveStatus: string
}

/**
 * Classificar status Guru de forma consistente em todo o sistema
 * Resolve o problema de `pending` não estar em nenhuma lista no compare
 */
export function getEffectiveStatus(
  guruStatus: string | null | undefined,
  dates?: GuruDateInfo | null
): EffectiveStatus {
  if (!guruStatus) {
    return { isActive: false, isCanceled: false, isPending: false, isPendingStale: false, effectiveStatus: 'unknown' }
  }

  if (guruStatus === 'pending') {
    const stale = isPendingStale(dates)
    return {
      isActive: !stale,
      isCanceled: stale,
      isPending: true,
      isPendingStale: stale,
      effectiveStatus: stale ? 'pending_stale' : 'pending_fresh'
    }
  }

  return {
    isActive: GURU_ACTIVE_STATUSES.includes(guruStatus),
    isCanceled: GURU_CANCELED_STATUSES.includes(guruStatus),
    isPending: false,
    isPendingStale: false,
    effectiveStatus: guruStatus
  }
}

/**
 * Obter prioridade de status para seleção de "melhor" subscrição
 * Pending stale recebe prioridade 8 (pior que tudo)
 */
export function getStatusPriority(
  status: string,
  dates?: GuruDateInfo | null
): number {
  if (status === 'pending') {
    return isPendingStale(dates) ? STALE_PENDING_PRIORITY : BASE_STATUS_PRIORITY['pending']
  }
  return BASE_STATUS_PRIORITY[status] ?? 99
}

/**
 * Verificar se newStatus é melhor ou igual a currentStatus
 */
export function isStatusBetterOrEqual(
  newStatus: string,
  currentStatus: string,
  newDates?: GuruDateInfo | null,
  currentDates?: GuruDateInfo | null
): boolean {
  return getStatusPriority(newStatus, newDates) <= getStatusPriority(currentStatus, currentDates)
}

// ═══════════════════════════════════════════════════════════
// HELPERS: CURSEDUCA API
// ═══════════════════════════════════════════════════════════

/**
 * Verificar estado real de um membro no CursEduca via API
 */
export async function verifyCurseducaMemberStatus(memberId: string | number): Promise<{
  situation: string
  name?: string
  email?: string
} | null> {
  if (!CURSEDUCA_ACCESS_TOKEN || !CURSEDUCA_API_KEY) return null

  try {
    const resp = await axios.get(`${CURSEDUCA_API_URL}/members/${memberId}`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY
      },
      timeout: 10000
    })
    const data = resp.data?.data || resp.data
    return {
      situation: data?.situation || 'UNKNOWN',
      name: data?.name,
      email: data?.email
    }
  } catch (err: any) {
    console.log(`   ⚠️ [CURSEDUCA API] Erro verificar membro ${memberId}: ${err.response?.status || err.message}`)
    return null
  }
}

/**
 * Procurar curseducaUserId por email na API CursEduca
 * Pesquisa nos grupos conhecidos da Clareza
 */
export async function lookupCurseducaUserIdByEmail(email: string): Promise<{
  curseducaUserId: string
  situation: string
  name?: string
} | null> {
  if (!CURSEDUCA_ACCESS_TOKEN || !CURSEDUCA_API_KEY) return null

  const emailLower = email.toLowerCase().trim()

  try {
    // Pesquisar diretamente na lista de membros (endpoint /members com filtro)
    const resp = await axios.get(`${CURSEDUCA_API_URL}/members`, {
      headers: {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY
      },
      params: {
        email: emailLower,
        per_page: 5
      },
      timeout: 15000
    })

    const members = resp.data?.data || resp.data || []
    const membersList = Array.isArray(members) ? members : [members]

    for (const member of membersList) {
      if (member?.email?.toLowerCase().trim() === emailLower) {
        return {
          curseducaUserId: String(member.id),
          situation: member.situation || 'UNKNOWN',
          name: member.name
        }
      }
    }

    // Se /members não suportou filtro por email, tentar por nome
    // (fallback - menos eficiente)
    return null
  } catch (err: any) {
    // Se 404 ou endpoint não suporta filtro, tentar busca alternativa
    if (err.response?.status === 404 || err.response?.status === 422) {
      // Tentar listar membros dos grupos conhecidos
      try {
        const CLAREZA_GROUP_IDS = ['6', '7'] // IDs dos grupos Clareza
        for (const groupId of CLAREZA_GROUP_IDS) {
          const groupResp = await axios.get(`${CURSEDUCA_API_URL}/groups/${groupId}/members`, {
            headers: {
              'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
              'api_key': CURSEDUCA_API_KEY
            },
            params: { per_page: 500 },
            timeout: 30000
          })

          const groupMembers = groupResp.data?.data || groupResp.data || []
          const list = Array.isArray(groupMembers) ? groupMembers : []

          for (const m of list) {
            if (m?.email?.toLowerCase().trim() === emailLower) {
              return {
                curseducaUserId: String(m.id),
                situation: m.situation || 'ACTIVE',
                name: m.name
              }
            }
          }

          await new Promise(resolve => setTimeout(resolve, 300)) // Rate limit
        }
      } catch (groupErr: any) {
        console.log(`   ⚠️ [CURSEDUCA LOOKUP] Erro grupos: ${groupErr.response?.status || groupErr.message}`)
      }
    } else {
      console.log(`   ⚠️ [CURSEDUCA LOOKUP] Erro pesquisar ${email}: ${err.response?.status || err.message}`)
    }
    return null
  }
}
