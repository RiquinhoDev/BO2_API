// ════════════════════════════════════════════════════════════
// 📁 curseduca.adapter.ts - VERSÃO FINAL COMPLETA E LIMPA
// ════════════════════════════════════════════════════════════
//
// ✅ Usa 2 endpoints:
//    1. /reports/group/members (lista + progresso)
//    2. /members/{id} (lastLogin + situation + enrolledAt)
//
// ✅ Process.env para credenciais
// ✅ Deduplicação inteligente
// ✅ Concurrency controlada
// ✅ Type-safe completo
//
// ════════════════════════════════════════════════════════════

import axios from 'axios'

// ✅ IMPORTS CORRETOS
import { UniversalSourceItem } from '../../../types/universalSync.types'
import {
  CurseducaSyncOptions,
  CursEducaGroup,
  CursEducaMemberFromReports,
  CursEducaMemberDetails,
  CursEducaMemberWithMetadata
} from '../../../types/curseduca.types'

// ═══════════════════════════════════════════════════════════
// CREDENCIAIS (PROCESS.ENV)
// ═══════════════════════════════════════════════════════════

const CURSEDUCA_API_URL="https://prof.curseduca.pro"
const CURSEDUCA_CONTENTS_API_URL="https://clas.curseduca.pro"
const CURSEDUCA_API_KEY="***REMOVED-CURSEDUCA-KEY***"
const CURSEDUCA_ACCESS_TOKEN="***REMOVED-JWT***"

// ═══════════════════════════════════════════════════════════
// HELPER: VALIDAR CREDENCIAIS
// ═══════════════════════════════════════════════════════════

function validateCredentials(): void {
  const missing: string[] = []
  
  if (!CURSEDUCA_API_URL) missing.push('CURSEDUCA_API_URL')
  if (!CURSEDUCA_ACCESS_TOKEN) missing.push('CURSEDUCA_AccessToken')
  if (!CURSEDUCA_API_KEY) missing.push('CURSEDUCA_API_KEY')
  
  if (missing.length > 0) {
    throw new Error(
      `❌ Credenciais CursEduca não configuradas no .env:\n` +
      `   Faltam: ${missing.join(', ')}\n` +
      `   Por favor, adicione no ficheiro .env`
    )
  }
}
function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}


// ═══════════════════════════════════════════════════════════
// HELPER: DEDUPLICAÇÃO INTELIGENTE
// ═══════════════════════════════════════════════════════════

function deduplicateMembers(
  members: CursEducaMemberWithMetadata[]
): CursEducaMemberWithMetadata[] {
  console.log(`📊 [Dedupe] Processando ${members.length} membros...`)

  const byEmail = new Map<string, CursEducaMemberWithMetadata[]>()

  for (const member of members) {
    const email = member.email.toLowerCase().trim()
    if (!byEmail.has(email)) byEmail.set(email, [])
    byEmail.get(email)!.push(member)
  }

  console.log(`   📧 ${byEmail.size} emails únicos`)

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

      console.log(
        `   🔁 ${email}: ${userProducts.length} produtos ` +
        `(primário: ${userProducts[0].subscriptionType})`
      )
    }
  }

  console.log(`   ✅ ${duplicateCount} users com múltiplos produtos`)
  console.log(`   📦 Total de produtos: ${result.length}`)

  return result
}

// ═══════════════════════════════════════════════════════════
// HELPER: DETECTAR TIPO DE SUBSCRIÇÃO
// ═══════════════════════════════════════════════════════════

function detectSubscriptionType(groupName: string): 'MONTHLY' | 'ANNUAL' | undefined {
  const nameLower = groupName.toLowerCase()
  
  if (nameLower.includes('mensal') || nameLower.includes('monthly')) {
    return 'MONTHLY'
  }
  
  if (nameLower.includes('anual') || nameLower.includes('annual') || nameLower.includes('yearly')) {
    return 'ANNUAL'
  }
  
  return undefined
}

// ═══════════════════════════════════════════════════════════
// HELPER: VALIDAR MEMBRO
// ═══════════════════════════════════════════════════════════

function validateCurseducaMember(member: CursEducaMemberFromReports): void {
  if (!member.email || !member.email.trim()) {
    throw new Error('Email é obrigatório')
  }
  
  if (!member.id) {
    throw new Error('ID do membro é obrigatório')
  }
  
  if (!member.name || !member.name.trim()) {
    throw new Error('Nome do membro é obrigatório')
  }
}

// ✅ Validação para CursEducaMemberWithMetadata
function validateCurseducaMemberExtended(
  member: CursEducaMemberWithMetadata
): void {
  if (!member.email || !member.email.trim()) {
    throw new Error('Email é obrigatório')
  }
  
  if (!member.id) {
    throw new Error('ID do membro é obrigatório')
  }
  
  if (!member.name || !member.name.trim()) {
    throw new Error('Nome do membro é obrigatório')
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: NORMALIZAR MEMBRO
// ═══════════════════════════════════════════════════════════

function normalizeCurseducaMember(
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

// ═══════════════════════════════════════════════════════════
// FETCH: LISTA DE MEMBROS (COM PROGRESSO)
// ═══════════════════════════════════════════════════════════

async function fetchGroupMembersList(
  groupId: number,
  headers: Record<string, string>
): Promise<CursEducaMemberFromReports[]> {
  const allMembers: CursEducaMemberFromReports[] = []
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0
  const maxPages = 10

  console.log(`   📄 Buscando lista de membros do grupo ${groupId}...`)

  while (hasMore && offset < 1000 && pageCount < maxPages) {
    pageCount++
    
    try {
      const response = await axios.get(
        `${CURSEDUCA_API_URL}/reports/group/members`,
        {
          params: { group: groupId, groupId, limit, offset },
          headers,
          timeout: 30000
        }
      )

      const pageMembers: CursEducaMemberFromReports[] = 
        response.data?.data || response.data || []

      console.log(`      Página ${pageCount}: ${pageMembers.length} membros`)
      
      allMembers.push(...pageMembers)
      
      hasMore = pageMembers.length === limit
      offset += limit
      
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
      
    } catch (error: any) {
      console.error(`   ❌ Erro na página ${pageCount}:`, error.message)
      throw error
    }
  }

  console.log(`   ✅ Total: ${allMembers.length} membros`)
  return allMembers
}
type CurseducaProgressReportItem = {
  finishedAt?: string
  member?: { id: number; email?: string }
  enrollment?: { progress?: number | string }
}

async function fetchProgressReport(
  groupId: number,
  headers: Record<string, string>
): Promise<Map<number, { progress: number; lastActivity?: string }>> {
  const progressMap = new Map<number, { progress: number; lastActivity?: string }>()
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0
  const maxPages = 20

  console.log(`   Buscando progresso detalhado do grupo ${groupId}...`)

  while (hasMore && offset < 2000 && pageCount < maxPages) {
    pageCount++

    try {
      const response = await axios.get(
        `${CURSEDUCA_CONTENTS_API_URL || CURSEDUCA_API_URL}/reports/progress`,
        {
          params: { group: groupId, groupId, limit, offset },
          headers,
          timeout: 30000
        }
      )

      const data = response.data || {}
      const items: CurseducaProgressReportItem[] = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : []

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

      const metadata = data.metadata || {}
      if (typeof metadata.hasMore === 'boolean') {
        hasMore = metadata.hasMore
      } else {
        hasMore = items.length === limit
      }

      offset += limit

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    } catch (error: any) {
      console.error(`   Erro ao buscar /reports/progress:`, error.message)
      break
    }
  }

  console.log(`   Progresso detalhado: ${progressMap.size} membros`)
  return progressMap
}

type CurseducaAccessReportItem = {
  createdAt?: string
  member?: { email?: string; uuid?: string }
}

async function fetchAccessReport(
  headers: Record<string, string>
): Promise<Map<string, { lastAccess?: string; accessCount: number }>> {
  const accessMap = new Map<string, { lastAccess?: string; accessCount: number }>()
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0
  const maxPages = 30

  console.log('   Buscando relatorio de acessos (reports/access)...')

  while (hasMore && offset < 3000 && pageCount < maxPages) {
    pageCount++

    try {
      const response = await axios.get(
        `${CURSEDUCA_API_URL}/reports/access`,
        {
          params: { limit, offset },
          headers,
          timeout: 30000
        }
      )

      const data = response.data || {}
      const items: CurseducaAccessReportItem[] = Array.isArray(data.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : []

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

      const metadata = data.metadata || {}
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
    } catch (error: any) {
      console.error('   Erro ao buscar /reports/access:', error.message)
      break
    }
  }

  console.log(`   Relatorio de acessos: ${accessMap.size} membros`)
  return accessMap
}



// ═══════════════════════════════════════════════════════════
// FETCH: DETALHES DE UM MEMBRO
// ═══════════════════════════════════════════════════════════

async function fetchMemberDetails(
  memberId: number,
  headers: Record<string, string>
): Promise<CursEducaMemberDetails | null> {
  try {
    const response = await axios.get(
      `${CURSEDUCA_API_URL}/members/${memberId}`,
      {
        headers,
        timeout: 10000
      }
    )

    return response.data as CursEducaMemberDetails
    
  } catch (error: any) {
    console.warn(`   ⚠️ Detalhes do membro ${memberId} indisponíveis: ${error.message}`)
    return null
  }
}

// ═══════════════════════════════════════════════════════════
// ENRICH: COMBINAR DADOS DOS 2 ENDPOINTS (SIMPLIFICADO)
// ═══════════════════════════════════════════════════════════
// ✅ Retorna 1 objeto por user, usando o groupId do grupo sendo processado
// ✅ Valida que o user REALMENTE pertence ao grupo antes de retornar

async function enrichMemberWithDetails(
  member: CursEducaMemberFromReports,
  groupId: number,
  groupName: string,
  headers: Record<string, string>
): Promise<CursEducaMemberWithMetadata | null> {

  // Buscar detalhes completos do user (para lastLogin e situation)
  const details = await fetchMemberDetails(member.id, headers)
  const fallbackLastAccess = (member as any).lastAccess as string | undefined
  const fallbackLastLogin = (member as any).lastLogin as string | undefined
  const fallbackAccessCount = (member as any).accessCount as number | undefined

  if (!details) {
    // Se falhou, retornar com dados básicos do grupo atual
    return {
      id: member.id,
      uuid: member.uuid,
      name: member.name,
      email: member.email,
      progress: member.progress,
      enrollmentsCount: member.enrollmentsCount,
      groupId,
      groupName,
      subscriptionType: detectSubscriptionType(groupName),
      enrolledAt: new Date().toISOString(),
      expiresAt: member.expiresAt,
      situation: 'ACTIVE',
      lastLogin: fallbackLastLogin,
      lastAccess: fallbackLastAccess,
      accessCount: fallbackAccessCount,
      isPrimary: true,
      isDuplicate: false
    }
  }

  // 🔥 CORREÇÃO: Verificar se o user REALMENTE está neste grupo específico
  const groupEnrollment = details.groups.find(g => g.group.id === groupId)

  // Se o user NÃO está neste grupo, retornar null para ignorar
  if (!groupEnrollment) {
    console.log(`   ⚠️  ${member.email} não pertence ao grupo ${groupId}, ignorando...`)
    return null
  }

  const enrolledAt = groupEnrollment.createdAt || details.createdAt

  // ✅ CORRETO: Retornar apenas 1 item com o groupId/groupName do grupo atual
  return {
    id: member.id,
    uuid: member.uuid,
    name: member.name,
    email: member.email,
    progress: member.progress,
    enrollmentsCount: member.enrollmentsCount,
    groupId,        // ✅ Usa o grupo sendo processado
    groupName,      // ✅ Usa o grupo sendo processado
    subscriptionType: detectSubscriptionType(groupName),
    enrolledAt,
    expiresAt: groupEnrollment.group.expiresAt || member.expiresAt,
    situation: details.situation,
    lastLogin: details.lastLogin || fallbackLastLogin,
    lastAccess: fallbackLastAccess || details.lastLogin,
    accessCount: fallbackAccessCount,
    isPrimary: true,  // Será ajustado na deduplicação
    isDuplicate: false
  }
}

// ═══════════════════════════════════════════════════════════
// MAIN FUNCTION: FETCH DATA FOR SYNC
// ═══════════════════════════════════════════════════════════

export const fetchCurseducaDataForSync = async (
  options: CurseducaSyncOptions = {
    includeProgress: true,
    includeGroups: true,
    progressConcurrency: 5,
    enrichWithDetails: true
  }
): Promise<UniversalSourceItem[]> => {  // ✅ CORRIGIDO!
  
  console.log('🚀 [CurseducaAdapter] Iniciando busca de dados para sync...')
  console.log('   📊 Opções:', options)
  console.log(`   🔄 Estratégia: ${options.enrichWithDetails ? 'Híbrida (2 endpoints)' : 'Simples (1 endpoint)'}`)

  const startTime = Date.now()

  try {
    // ✅ VALIDAR CREDENCIAIS
    validateCredentials()

    // ✅ CRIAR HEADERS UMA ÚNICA VEZ
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN!}`,
      'api_key': CURSEDUCA_API_KEY!,
      'Content-Type': 'application/json'
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 1: BUSCAR GRUPOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('📚 [CurseducaAdapter] Step 1/5: Buscando grupos...')
    
    const groupsResponse = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
      headers,
      timeout: 30000
    })
    
    let allGroups: CursEducaGroup[] = 
      Array.isArray(groupsResponse.data) 
        ? groupsResponse.data 
        : groupsResponse.data?.data || groupsResponse.data?.groups || []
    
    allGroups = allGroups.filter(g => 
      g.name.toLowerCase().includes('clareza')
    )

    if (options.groupId) {
      allGroups = allGroups.filter(g => 
        g.id.toString() === options.groupId || 
        g.uuid === options.groupId
      )
      
      if (allGroups.length === 0) {
        throw new Error(`Grupo não encontrado: ${options.groupId}`)
      }
      
      console.log(`   🎯 Filtrando apenas grupo: ${allGroups[0].name}`)
    }

    console.log(`✅ [CurseducaAdapter] ${allGroups.length} grupos Clareza encontrados`)
    
    if (allGroups.length === 0) {
      console.warn('⚠️ [CurseducaAdapter] Nenhum grupo Clareza encontrado!')
      return []
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 2: BUSCAR LISTA DE MEMBROS (ESTRATÉGIA HÍBRIDA)
    // ═══════════════════════════════════════════════════════════

    console.log('👥 [CurseducaAdapter] Step 2/6: Buscando lista de membros (HÍBRIDO)...')
    console.log('   💡 Usando 2 endpoints para capturar TODOS os users:')
    console.log('   1️⃣  /reports/group/members (users com enrollments)')
    console.log('   2️⃣  /groups/{groupId}/members (TODOS, incluindo admins)')

    console.log('   Buscando relatorio de acessos para engagement...')
    const accessReport = await fetchAccessReport(headers)
    const allMembersWithMetadata: CursEducaMemberWithMetadata[] = []
    const errors: string[] = []

    for (const group of allGroups) {
      try {
        console.log(`   📚 Processando grupo: ${group.name} (ID: ${group.id})`)

        // STEP 1: Buscar lista completa via /groups/{id}/members
        console.log(`   📡 1/2: Buscando lista via /groups/${group.id}/members...`)

        const groupMembersResponse = await axios.get(
          `${CURSEDUCA_API_URL}/groups/${group.id}/members`,
          {
            headers,
            params: { limit: 1000 },
            timeout: 30000
          }
        )

        const allGroupMembers = Array.isArray(groupMembersResponse.data)
          ? groupMembersResponse.data
          : groupMembersResponse.data?.data || groupMembersResponse.data?.members || []

        console.log(`   ✅ ${allGroupMembers.length} members encontrados`)

        // STEP 2: Buscar progresso via /reports/group/members
        console.log(`   📡 2/2: Buscando progresso via /reports/group/members...`)
        const membersWithProgress = await fetchGroupMembersList(group.id, headers)
        console.log(`   ✅ ${membersWithProgress.length} members com dados de progresso`)

        // STEP 3: Merge - adicionar progresso aos members (preferir email se IDs divergem)
        const progressById = new Map<number, CursEducaMemberFromReports>()
        const progressByEmail = new Map<string, CursEducaMemberFromReports>()

        membersWithProgress.forEach(m => {
          progressById.set(m.id, m)
          const progressEmailKey = normalizeEmail(m.email)
          if (progressEmailKey) {
            progressByEmail.set(progressEmailKey, m)
          }
        })

        const membersByEmail = new Set<string>()
        const unifiedMembersList = allGroupMembers.map(gm => {
          const emailKey = normalizeEmail(gm.email)
          if (emailKey) membersByEmail.add(emailKey)

          const withProgress = progressById.get(gm.id) || (emailKey ? progressByEmail.get(emailKey) : undefined)
          const accessInfo = emailKey ? accessReport.get(emailKey) : undefined

          return {
            id: gm.id,
            uuid: gm.uuid,
            name: gm.name,
            email: gm.email,
            progress: withProgress?.progress || 0,
            enrollmentsCount: withProgress?.enrollmentsCount || 0,
            expiresAt: withProgress?.expiresAt || gm.expiresAt,
            groups: withProgress?.groups || [],
            lastLogin: accessInfo?.lastAccess,
            lastAccess: accessInfo?.lastAccess,
            accessCount: accessInfo?.accessCount
          }
        })

        const extraMembers = membersWithProgress.filter(m => {
          const emailKey = normalizeEmail(m.email)
          return emailKey && !membersByEmail.has(emailKey)
        })

        if (extraMembers.length > 0) {
          extraMembers.forEach(m => {
            const emailKey = normalizeEmail(m.email)
            if (emailKey) membersByEmail.add(emailKey)
          })
          unifiedMembersList.push(...extraMembers.map(m => {
            const emailKey = normalizeEmail(m.email)
            const accessInfo = emailKey ? accessReport.get(emailKey) : undefined
            return {
              id: m.id,
              uuid: m.uuid,
              name: m.name,
              email: m.email,
              progress: m.progress || 0,
              enrollmentsCount: m.enrollmentsCount || 0,
              expiresAt: m.expiresAt,
              groups: m.groups || [],
              lastLogin: accessInfo?.lastAccess,
              lastAccess: accessInfo?.lastAccess,
              accessCount: accessInfo?.accessCount
            }
          }))
        }


        console.log(`   ✅ Dados mesclados: ${unifiedMembersList.length} members com progresso`)

        const progressReport = await fetchProgressReport(group.id, headers)
        if (progressReport.size > 0) {
          let updatedCount = 0
          for (const member of unifiedMembersList) {
            const extra = progressReport.get(member.id)
            if (extra && extra.progress > (member.progress || 0)) {
              member.progress = extra.progress
              updatedCount++
            }
            if (extra?.lastActivity && !member.lastAccess) {
              member.lastAccess = extra.lastActivity
              if (!member.lastLogin) {
                member.lastLogin = extra.lastActivity
              }
            }
          }

          if (updatedCount > 0) {
            console.log(`   Progresso extra aplicado: ${updatedCount} members`)
          }
        }


        // ═══════════════════════════════════════════════════════════
        // STEP 3: ENRIQUECER COM DETALHES
        // ═══════════════════════════════════════════════════════════

        if (options.enrichWithDetails) {
          console.log(`   🔄 Buscando detalhes (lastLogin, situation)...`)

          const concurrency = options.progressConcurrency || 5
          const enrichedMembers: CursEducaMemberWithMetadata[] = []

          for (let i = 0; i < unifiedMembersList.length; i += concurrency) {
            const batch = unifiedMembersList.slice(i, i + concurrency)

            const batchPromises = batch.map(member =>
              enrichMemberWithDetails(member, group.id, group.name, headers)
            )

            const batchResults = await Promise.all(batchPromises)
            // 🔥 FILTRAR nulls (users que não pertencem a este grupo)
            const validResults = batchResults.filter(r => r !== null) as CursEducaMemberWithMetadata[]
            enrichedMembers.push(...validResults)

            if (i + concurrency < unifiedMembersList.length) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }

            const processed = Math.min(i + concurrency, unifiedMembersList.length)
            console.log(`      Processados ${processed}/${unifiedMembersList.length}`)
          }

          for (const enrichedMember of enrichedMembers) {
            try {
              validateCurseducaMemberExtended(enrichedMember)
              allMembersWithMetadata.push(enrichedMember)
            } catch (error: any) {
              errors.push(`${enrichedMember.email}: ${error.message}`)
            }
          }

        } else {
          console.log(`   ℹ️  Modo simples (sem fetch de detalhes)`)

          for (const member of unifiedMembersList) {
            try {
              validateCurseducaMember(member)

              allMembersWithMetadata.push({
                id: member.id,
                uuid: member.uuid,
                name: member.name,
                email: member.email,
                progress: member.progress || 0,
                enrollmentsCount: member.enrollmentsCount || 0,
                groupId: group.id,
                groupName: group.name,
                subscriptionType: detectSubscriptionType(group.name) || 'MONTHLY',
                enrolledAt: new Date().toISOString(),
                expiresAt: member.expiresAt,
                situation: 'ACTIVE',
                lastLogin: (member as any).lastLogin,
                lastAccess: (member as any).lastAccess,
                accessCount: (member as any).accessCount
              })

            } catch (error: any) {
              errors.push(`${member.email || 'unknown'}: ${error.message}`)
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error: any) {
        console.error(`   ❌ Erro ao processar grupo ${group.name}:`, error.message)
        errors.push(`Grupo ${group.name}: ${error.message}`)
      }
    }

    console.log(`✅ [CurseducaAdapter] ${allMembersWithMetadata.length} membros processados`)

    // ═══════════════════════════════════════════════════════════
    // STEP 4: DEDUPLICAR
    // ═══════════════════════════════════════════════════════════

    console.log('🔄 [CurseducaAdapter] Step 4/5: Deduplicando membros...')

    const deduplicated = deduplicateMembers(allMembersWithMetadata)

    const stats = {
      total: deduplicated.length,
      unique: deduplicated.filter(m => m.isPrimary).length,
      duplicates: deduplicated.filter(m => m.isDuplicate && !m.isPrimary).length
    }

    console.log(`✅ [CurseducaAdapter] Deduplicação completa:`)
    console.log(`   📦 Total produtos: ${stats.total}`)
    console.log(`   📧 Users únicos: ${stats.unique}`)
    console.log(`   🔁 Produtos secundários: ${stats.duplicates}`)

    // ═══════════════════════════════════════════════════════════
    // STEP 5: NORMALIZAR
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔄 [CurseducaAdapter] Step 5/5: Normalizando dados...')
    
    const normalized = deduplicated.map(m => normalizeCurseducaMember(m))

    const duration = Math.floor((Date.now() - startTime) / 1000)
    
    console.log('✅ [CurseducaAdapter] Dados preparados!')
    console.log(`   ⏱️ Duração: ${duration}s`)
    console.log(`   ✅ Total: ${normalized.length}`)
    console.log(`   ❌ Erros: ${errors.length}`)

    if (errors.length > 0) {
      console.warn('⚠️ [CurseducaAdapter] Erros:', errors.slice(0, 5))
      if (errors.length > 5) {
        console.warn(`   ... e mais ${errors.length - 5} erros`)
      }
    }

    return normalized
    
  } catch (error: any) {
    console.error('❌ [CurseducaAdapter] Erro fatal:', error)
    
    if (error.response?.status === 401) {
      throw new Error(
        `Adapter falhou: Autenticação inválida (401)\n` +
        `Verifique CURSEDUCA_AccessToken e CURSEDUCA_API_KEY no .env`
      )
    }
    
    throw new Error(`Adapter falhou: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// 🆕 SYNC INDIVIDUAL - ESTRATÉGIA OTIMIZADA (2 CHAMADAS)
// ═══════════════════════════════════════════════════════════

export const fetchSingleUserData = async (
  curseducaUserId: number
): Promise<UniversalSourceItem[]> => {
  console.log(`🔍 [CurseducaAdapter] Buscando dados do user ${curseducaUserId}...`)

  try {
    validateCredentials()

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN!}`,
      'api_key': CURSEDUCA_API_KEY!,
      'Content-Type': 'application/json'
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 1: GET /members/{id} - Dados completos do user
    // ═══════════════════════════════════════════════════════════

    console.log(`   📡 Buscando dados básicos...`)
    const memberResponse = await axios.get(
      `${CURSEDUCA_API_URL}/members/${curseducaUserId}`,
      { headers, timeout: 15000 }
    )

    const memberData = memberResponse.data as CursEducaMemberDetails
    console.log(`   ✅ User: ${memberData.email}`)
    console.log(`   📊 Groups: ${memberData.groups.length}`)

    // ═══════════════════════════════════════════════════════════
    // STEP 2: GET /api/reports/enrollments?memberId={id}
    // ═══════════════════════════════════════════════════════════

    console.log(`   📡 Buscando enrollments...`)

    let enrollments: any[] = []

    try {
      const enrollmentsResponse = await axios.get(
        `${CURSEDUCA_API_URL}/api/reports/enrollments`,
        {
          params: { memberId: curseducaUserId, limit: 100 },
          headers,
          timeout: 15000
        }
      )

      enrollments = enrollmentsResponse.data?.data || []
      console.log(`   ✅ Enrollments: ${enrollments.length}`)

    } catch (enrollmentError: any) {
      if (enrollmentError.response?.status === 404) {
        console.log(`   ⚠️  Nenhum enrollment encontrado (404)`)
        console.log(`   ℹ️  Usando apenas dados dos groups (user pode ser admin)`)
        enrollments = []
      } else {
        throw enrollmentError
      }
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 3: MAPEAR ENROLLMENTS → UNIVERSAL SOURCE ITEMS
    // ═══════════════════════════════════════════════════════════

    const results: UniversalSourceItem[] = []

    if (enrollments.length > 0) {
      // CASO A: Tem enrollments - usar dados do enrollment
      for (const enrollment of enrollments) {
        // Encontrar grupo correspondente
        const group = memberData.groups.find(
          g => g.group.id === enrollment.content?.id
        )

        if (!group) {
          console.warn(`   ⚠️ Grupo ${enrollment.content?.id} não encontrado para enrollment`)
          continue
        }

        const subscriptionType = detectSubscriptionType(group.group.name)

        const item: UniversalSourceItem = {
          email: memberData.email,
          name: memberData.name || memberData.email,
          curseducaUserId: memberData.id.toString(),
          curseducaUuid: memberData.uuid,
          groupId: group.group.id.toString(),
          groupName: group.group.name,
          subscriptionType: subscriptionType || 'MONTHLY',
          lastLogin: memberData.lastLogin,
          lastAccess: memberData.lastLogin,
          enrolledAt: group.createdAt || enrollment.startedAt,
          joinedDate: group.createdAt ? new Date(group.createdAt) : undefined,
          expiresAt: group.group.expiresAt ? new Date(group.group.expiresAt) : undefined,
          progress: {
            percentage: enrollment.progress || 0,
            completed: enrollment.finishedAt ? 100 : enrollment.progress || 0,
            lessons: []
          },
          engagement: {
            engagementScore: enrollment.progress ? Math.min(100, enrollment.progress * 2) : 0
          },
          platformData: {
            isPrimary: true,
            isDuplicate: false,
            enrollmentsCount: enrollments.length,
            situation: memberData.situation || 'ACTIVE'
          }
        }

        results.push(item)
      }

    } else {
      // CASO B: Sem enrollments - criar items baseados apenas nos groups
      console.log(`   📦 Criando items baseados em ${memberData.groups.length} group(s)...`)

      for (const groupData of memberData.groups) {
        const subscriptionType = detectSubscriptionType(groupData.group.name)

        const item: UniversalSourceItem = {
          email: memberData.email,
          name: memberData.name || memberData.email,
          curseducaUserId: memberData.id.toString(),
          curseducaUuid: memberData.uuid,
          groupId: groupData.group.id.toString(),
          groupName: groupData.group.name,
          subscriptionType: subscriptionType || 'MONTHLY',
          lastLogin: memberData.lastLogin,
          lastAccess: memberData.lastLogin,
          enrolledAt: groupData.createdAt,
          joinedDate: groupData.createdAt ? new Date(groupData.createdAt) : undefined,
          expiresAt: groupData.group.expiresAt ? new Date(groupData.group.expiresAt) : undefined,
          progress: {
            percentage: 0, // Sem enrollment = sem progress
            completed: 0,
            lessons: []
          },
          engagement: {
            engagementScore: 0
          },
          platformData: {
            isPrimary: true,
            isDuplicate: false,
            enrollmentsCount: 0,
            situation: memberData.situation || 'ACTIVE'
          }
        }

        results.push(item)
      }
    }

    console.log(`✅ [CurseducaAdapter] ${results.length} items criados para user ${curseducaUserId}`)

    return results

  } catch (error: any) {
    console.error(`❌ [CurseducaAdapter] Erro ao buscar user ${curseducaUserId}:`, error.message)

    if (error.response?.status === 404) {
      console.error(`   User ${curseducaUserId} não encontrado no CursEduca`)
      return []
    }

    throw new Error(`Erro ao buscar dados do user ${curseducaUserId}: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// PLACEHOLDER
// ═══════════════════════════════════════════════════════════

export const fetchProgressForExistingUsers = async (
  userIds: string[]
): Promise<Map<string, { estimatedProgress: number }>> => {
  console.log(`📊 [CurseducaAdapter] Progresso para ${userIds.length} utilizadores...`)
  console.warn('⚠️ CursEduca não tem endpoint dedicado de progresso')
  console.info('   💡 Use fetchCurseducaDataForSync completo ou fetchSingleUserData')
  return new Map()
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

export default {
  fetchCurseducaDataForSync,
  fetchSingleUserData,
  fetchProgressForExistingUsers
}
