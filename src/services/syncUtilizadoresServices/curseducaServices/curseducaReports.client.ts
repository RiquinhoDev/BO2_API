import logger from '../../../utils/logger'
import axios from 'axios'
import {
  CursEducaMemberFromReports,
  CursEducaMemberWithMetadata
} from '../../../types/curseduca.types'
import {
  BulkCurseducaMember,
  CollectionPayload,
  UnifiedCurseducaMember,
  collectionItems,
  collectionMetadata,
  curseducaApiUrl,
  CURSEDUCA_CONTENTS_API_URL,
  detectSubscriptionType,
  errorMessage,
  normalizeEmail,
  toNumber
} from './curseducaAdapterSupport'
export async function fetchGroupMembersList(
  groupId: number,
  headers: Record<string, string>
): Promise<CursEducaMemberFromReports[]> {
  const allMembers: CursEducaMemberFromReports[] = []
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0
  const maxPages = 10

  logger.info(`   ðŸ“„ Buscando lista de membros do grupo ${groupId}...`)

  while (hasMore && offset < 1000 && pageCount < maxPages) {
    pageCount++
    
    try {
      const response = await axios.get<CollectionPayload<CursEducaMemberFromReports>>(
        `${curseducaApiUrl()}/reports/group/members`,
        {
          params: { group: groupId, groupId, limit, offset },
          headers,
          timeout: 30000
        }
      )

      const pageMembers = collectionItems(response.data)

      logger.info(`      PÃ¡gina ${pageCount}: ${pageMembers.length} membros`)
      
      allMembers.push(...pageMembers)
      
      hasMore = pageMembers.length === limit
      offset += limit
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
    } catch (error: unknown) {
      logger.error(`   âŒ Erro na pÃ¡gina ${pageCount}:`, errorMessage(error))
      throw error
    }
  }

  logger.info(`   âœ… Total: ${allMembers.length} membros`)
  return allMembers
}
export type CurseducaProgressReportItem = {
  finishedAt?: string
  member?: { id: number; email?: string }
  enrollment?: { progress?: number | string }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HELPER: Mapear grupo para content slug
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
export function getContentSlugFromGroup(groupName: string): string | null {
  const normalized = groupName.toLowerCase().trim()

  if (normalized.includes('clareza')) {
    return 'clareza'
  }
  if (normalized.includes('ogi') || normalized.includes('o grande investimento')) {
    return 'ogi'
  }

  // Fallback: tentar extrair primeira palavra
  return null
}

export async function fetchProgressReport(
  groupId: number,
  groupName: string,
  headers: Record<string, string>
): Promise<Map<number, { progress: number; lastActivity?: string }>> {
  const progressMap = new Map<number, { progress: number; lastActivity?: string }>()
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0
  const maxPages = 20

  // Mapear grupo para content
  const contentSlug = getContentSlugFromGroup(groupName)
  if (!contentSlug) {
    logger.info(`   âš ï¸  NÃ£o consegui mapear grupo "${groupName}" para content, saltando...`)
    return progressMap
  }

  logger.info(`   Buscando progresso detalhado do grupo ${groupId} (content: ${contentSlug})...`)

  while (hasMore && offset < 2000 && pageCount < maxPages) {
    pageCount++

    try {
      const response = await axios.get<CollectionPayload<CurseducaProgressReportItem>>(
        `${CURSEDUCA_CONTENTS_API_URL}/reports/progress`,
        {
          params: { content: contentSlug, limit, offset },
          headers,
          timeout: 30000
        }
      )

      const data = response.data
      const items = collectionItems(data)

      for (const item of items) {
        const memberId = item.member?.id
        if (!memberId) continue

        const progressValue = toNumber(item.enrollment?.progress, 0)
        const lastActivity = item.finishedAt

        const existing = progressMap.get(memberId)
        if (!existing || progressValue > existing.progress) {
          progressMap.set(memberId, {
            progress: progressValue,
            lastActivity: lastActivity || existing?.lastActivity
          })
        } else if (lastActivity && !existing.lastActivity) {
          progressMap.set(memberId, {
            progress: existing.progress,
            lastActivity
          })
        }
      }

      const metadata = collectionMetadata(data)
      if (typeof metadata.hasMore === 'boolean') {
        hasMore = metadata.hasMore
      } else {
        hasMore = items.length === limit
      }

      offset += limit

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } catch (error: unknown) {
      logger.error(`   Erro ao buscar /reports/progress:`, errorMessage(error))
      break
    }
  }

  logger.info(`   Progresso detalhado: ${progressMap.size} membros`)
  return progressMap
}

export type CurseducaAccessReportItem = {
  createdAt?: string
  member?: { email?: string; uuid?: string }
}

export async function fetchAccessReport(
  headers: Record<string, string>
): Promise<Map<string, { lastAccess?: string; accessCount: number }>> {
  const accessMap = new Map<string, { lastAccess?: string; accessCount: number }>()
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0
  const maxPages = 30

  logger.info('   Buscando relatorio de acessos (reports/access)...')

  while (hasMore && offset < 3000 && pageCount < maxPages) {
    pageCount++

    try {
      const response = await axios.get<CollectionPayload<CurseducaAccessReportItem>>(
        `${curseducaApiUrl()}/reports/access`,
        {
          params: { limit, offset },
          headers,
          timeout: 30000
        }
      )

      const data = response.data
      const items = collectionItems(data)

      for (const item of items) {
        const email = normalizeEmail(item.member?.email)
        if (!email) continue

        const createdAt = item.createdAt
        const existing = accessMap.get(email) || { accessCount: 0 }

        existing.accessCount += 1

        if (createdAt) {
          const existingTime = existing.lastAccess ? Date.parse(existing.lastAccess) : 0
          const newTime = Date.parse(createdAt)

          if (!existing.lastAccess || (Number.isFinite(newTime) && newTime > existingTime)) {
            existing.lastAccess = createdAt
          }
        }

        accessMap.set(email, existing)
      }

      const metadata = collectionMetadata(data)
      if (typeof metadata.hasMore === 'boolean') {
        hasMore = metadata.hasMore
      } else if (typeof metadata.hasmore === 'boolean') {
        hasMore = metadata.hasmore
      } else {
        hasMore = items.length === limit
      }

      offset += limit

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } catch (error: unknown) {
      logger.error('   Erro ao buscar /reports/access:', errorMessage(error))
      break
    }
  }

  logger.info(`   Relatorio de acessos: ${accessMap.size} membros`)
  return accessMap
}



// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// FETCH: TODOS OS MEMBROS EM MASSA (situation + lastAccess)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Substitui o enrich 1-a-1 via /members/{id} (que sofre de 504s
// intermitentes ~20% e nÃ£o escala). O endpoint /members devolve, paginado,
// situation + lastAccess + groups de TODOS os membros â€” incluindo users
// novos. Custo O(pÃ¡ginas) em vez de O(membros): 734 membros = 8 chamadas
// (~12s) vs 518 chamadas individuais (~25-34min).
// Robusto: retry por pÃ¡gina; se uma pÃ¡gina falhar de vez, esses ids ficam
// fora do mapa e caem no fallback 'ACTIVE' (igual ao comportamento do 504).

export interface BulkMemberInfo {
  situation?: string
  lastAccess?: string
  groupIds: number[]
}

export async function fetchAllMembersMap(
  headers: Record<string, string>
): Promise<Map<number, BulkMemberInfo>> {
  const map = new Map<number, BulkMemberInfo>()
  const limit = 100
  let offset = 0
  let total: number | undefined
  let pages = 0
  const maxPages = 200 // teto de seguranÃ§a (~20k membros)

  logger.info('   ðŸ“¡ Buscando TODOS os membros em massa via /members (paginado)...')

  while (pages < maxPages) {
    pages++
    let pageDone = false

    for (let attempt = 1; attempt <= 3 && !pageDone; attempt++) {
      try {
        const response = await axios.get<CollectionPayload<BulkCurseducaMember>>(`${curseducaApiUrl()}/members`, {
          params: { limit, offset },
          headers,
          timeout: 30000
        })

        const data = response.data
        const items = collectionItems(data)
        const meta = collectionMetadata(data)
        if (typeof meta.totalCount === 'number') total = meta.totalCount

        for (const m of items) {
          if (m?.id == null) continue
          map.set(m.id, {
            situation: m.situation,
            lastAccess: m.lastAccess,
            groupIds: Array.isArray(m.groups)
              ? m.groups
                .map(g => g.groupId)
                .filter((groupId): groupId is number => groupId !== undefined)
              : []
          })
        }

        pageDone = true

        const hasMore = typeof meta.hasMore === 'boolean'
          ? meta.hasMore
          : items.length === limit

        if (!hasMore || items.length === 0) {
          logger.info(`   âœ… Membros em massa: ${map.size}${total ? `/${total}` : ''} (${pages} pÃ¡ginas)`)
          return map
        }
        offset += limit
      } catch (error: unknown) {
        logger.warn(`   âš ï¸ /members offset=${offset} tentativa ${attempt}/3 falhou: ${errorMessage(error)}`)
        if (attempt === 3) {
          // Desiste desta pÃ¡gina mas continua â€” ids em falta caem no fallback 'ACTIVE'
          offset += limit
          pageDone = true
        } else {
          await new Promise(r => setTimeout(r, 500 * attempt))
        }
      }
    }
  }

  logger.info(`   âœ… Membros em massa: ${map.size}${total ? `/${total}` : ''} (${pages} pÃ¡ginas, teto atingido)`)
  return map
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ENRICH (EM MASSA): combinar roster + mapa de /members
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Substitui o antigo enrichMemberWithDetails (1 chamada /members/{id} por
// membro). Regra de pertenÃ§a ao grupo (roster /groups/{id}/members Ã© a
// autoridade): MANTÃ‰M o membro no grupo G se
//     estÃ¡ no ROSTER de G  OU  o bulk /members confirma o grupo G.
// Caso contrÃ¡rio descarta. Isto:
//   â€¢ mantÃ©m membros do roster mesmo quando o bulk vem com groups:[] (glitch
//     intermitente da API) -> corrige inativaÃ§Ãµes indevidas;
//   â€¢ descarta os "extra" do /reports que jÃ¡ saÃ­ram do grupo (nÃ£o estÃ£o no
//     roster e o bulk nÃ£o confirma) -> evita produtos fantasma.

export function enrichMemberFromBulk(
  member: UnifiedCurseducaMember,
  groupId: number,
  groupName: string,
  bulkMap: Map<number, BulkMemberInfo>,
  rosterIds: Set<number>
): CursEducaMemberWithMetadata | null {
  const bulk = bulkMap.get(member.id)

  const inRoster = rosterIds.has(member.id)
  const bulkConfirmsThisGroup = !!bulk && bulk.groupIds.includes(groupId)

  // NÃ£o estÃ¡ no roster do grupo E o bulk nÃ£o confirma este grupo -> nÃ£o pertence.
  if (!inRoster && !bulkConfirmsThisGroup) {
    return null
  }

  const fallbackLastAccess = member.lastAccess
  const fallbackLastLogin = member.lastLogin

  return {
    id: member.id,
    uuid: member.uuid,
    name: member.name,
    email: member.email,
    progress: member.progress,
    enrollmentsCount: member.enrollmentsCount,
    groupId,        // do roster (grupo sendo processado)
    groupName,
    subscriptionType: detectSubscriptionType(groupName),
    enrolledAt: member.enteredAt || new Date().toISOString(),
    expiresAt: member.expiresAt,
    situation: bulk?.situation || 'ACTIVE',           // real do bulk; fallback 'ACTIVE' (= comportamento antigo no 504)
    lastLogin: bulk?.lastAccess || fallbackLastLogin,
    lastAccess: fallbackLastAccess || bulk?.lastAccess,
    accessCount: member.accessCount,
    isPrimary: true,  // ajustado na deduplicaÃ§Ã£o
    isDuplicate: false
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN FUNCTION: FETCH DATA FOR SYNC
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

