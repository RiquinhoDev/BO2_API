// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilziadoresServices/curseducaServices/curseduca.adapter.ts
// CursEduca Adapter - VERSÃO FINAL COMPLETA
// ════════════════════════════════════════════════════════════
// ✅ Endpoint correto: /reports/group/members (tem progresso!)
// ✅ Paginação completa
// ✅ Deduplicação inteligente por data mais recente
// ✅ isPrimary para marcar produto ativo
// ════════════════════════════════════════════════════════════

import { UniversalSourceItem } from '../universalSyncService'
import axios from 'axios'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CurseducaSyncOptions {
  includeProgress: boolean
  includeGroups: boolean
  groupId?: string
  progressConcurrency?: number
}

interface CursEducaGroup {
  id: number
  uuid?: string
  name: string
  description?: string
}

interface CursEducaMember {
  id: number
  uuid: string
  name: string
  email: string
  expiresAt?: string | null
  enrollmentsCount?: number
  progress?: number
  groups?: Array<{
    id: number
    uuid: string
    name: string
  }>
  enteredAt?: string
  tenants?: Array<{
    tenantId: number
  }>
}

interface CursEducaMemberWithMetadata extends CursEducaMember {
  groupId: number
  groupName: string
  subscriptionType: 'MONTHLY' | 'ANNUAL'
  isPrimary?: boolean
  isDuplicate?: boolean
}

export type UniversalSyncUserData =
  Omit<UniversalSourceItem, 'email' | 'name' | 'curseducaUserId'> & {
    email: string
    name: string
    curseducaUserId: string
    curseducaUuid?: string
    groupId?: string
    groupName?: string
    subscriptionType?: 'MONTHLY' | 'ANNUAL'
    progress?: UniversalSourceItem['progress'] & {
      estimatedProgress?: number
      activityLevel?: 'HIGH' | 'MEDIUM' | 'LOW'
    }
    platformData?: {
      isPrimary?: boolean
      isDuplicate?: boolean
      enrollmentsCount?: number
    }
  }

// ═══════════════════════════════════════════════════════════
// ENV VARS
// ═══════════════════════════════════════════════════════════

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_AccessToken
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY

// ═══════════════════════════════════════════════════════════
// ✅ DEDUPLICAÇÃO INTELIGENTE
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
      
      // Ordenar por data (mais recente primeiro)
      userProducts.sort((a, b) => {
        const dateA = a.enteredAt ? new Date(a.enteredAt).getTime() : 0
        const dateB = b.enteredAt ? new Date(b.enteredAt).getTime() : 0
        return dateB - dateA
      })
      
      // Marcar primário (mais recente)
      userProducts[0].isPrimary = true
      userProducts[0].isDuplicate = true
      
      for (let i = 1; i < userProducts.length; i++) {
        userProducts[i].isPrimary = false
        userProducts[i].isDuplicate = true
      }
      
      result.push(...userProducts)
      
      console.log(`   🔁 ${email}: ${userProducts.length} produtos (primário: ${userProducts[0].subscriptionType})`)
    }
  }
  
  console.log(`   ✅ ${duplicateCount} users com múltiplos produtos`)
  console.log(`   📦 Total de produtos: ${result.length}`)
  
  return result
}

// ═══════════════════════════════════════════════════════════
// HELPERS
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

function validateCurseducaMember(member: CursEducaMember): void {
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

function normalizeCurseducaMember(
  member: CursEducaMemberWithMetadata
): UniversalSyncUserData {
  const email = member.email.toLowerCase().trim()
  const name = member.name.trim() || email
  
  return {
    email,
    name,
    curseducaUserId: member.id.toString(),
    curseducaUuid: member.uuid,
    groupId: member.groupId.toString(),
    groupName: member.groupName,
    subscriptionType: member.subscriptionType,
    
    // ✅ PROGRESS (formato correto para Universal Sync)
    progress: {
      percentage: member.progress || 0,
      completed: 0,
      lessons: []
    },

    // ✅ ENGAGEMENT (calculado do progress)
    engagement: {
      engagementScore: member.progress ? Math.min(100, member.progress * 2) : 0
    },
    
    // DATAS
    joinedDate: member.enteredAt ? new Date(member.enteredAt) : new Date(),
    enrolledAt: member.enteredAt ? new Date(member.enteredAt) : new Date(),
    expiresAt: member.expiresAt ? new Date(member.expiresAt) : undefined,
    
    // ✅ METADATA DE DEDUPLICAÇÃO
    platformData: {
      isPrimary: member.isPrimary || false,
      isDuplicate: member.isDuplicate || false,
      enrollmentsCount: member.enrollmentsCount || 0
    }
  }
}

// ═══════════════════════════════════════════════════════════
// ✅ FETCH MEMBERS COM PAGINAÇÃO
// ═══════════════════════════════════════════════════════════

async function fetchAllGroupMembers(
  groupId: number,
  headers: Record<string, string>
): Promise<CursEducaMember[]> {
  const allMembers: CursEducaMember[] = []
  let offset = 0
  const limit = 100
  let hasMore = true
  let pageCount = 0

  console.log(`   📄 Buscando membros do grupo ${groupId}...`)

  while (hasMore && offset < 1000) {
    pageCount++
    
    try {
      // ✅ USA /reports/group/members (TEM PROGRESSO!)
      const response = await axios.get(
        `${CURSEDUCA_API_URL}/reports/group/members`,
        {
          params: { groupId, limit, offset },
          headers
        }
      )

      let pageMembers: CursEducaMember[] = []

      // Detectar estrutura da resposta
      if (response.data?.metadata && response.data?.data) {
        pageMembers = response.data.data
      } else if (Array.isArray(response.data)) {
        pageMembers = response.data
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        pageMembers = response.data.data
      } else if (response.data?.members && Array.isArray(response.data.members)) {
        pageMembers = response.data.members
      }

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

// ═══════════════════════════════════════════════════════════
// MAIN ADAPTER FUNCTION
// ═══════════════════════════════════════════════════════════

export const fetchCurseducaDataForSync = async (
  options: CurseducaSyncOptions = {
    includeProgress: true,
    includeGroups: true,
    progressConcurrency: 5
  }
): Promise<UniversalSyncUserData[]> => {
  console.log('🚀 [CurseducaAdapter] Iniciando busca de dados para sync...')
  console.log('   📊 Opções:', options)

  const startTime = Date.now()

  try {
    // VALIDAR ENV VARS
    if (!CURSEDUCA_API_URL || !CURSEDUCA_ACCESS_TOKEN || !CURSEDUCA_API_KEY) {
      throw new Error('Credenciais CursEduca não configuradas (.env)')
    }

    const headers = {
      'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
      'api_key': CURSEDUCA_API_KEY,
      'Content-Type': 'application/json'
    }

    // ═══════════════════════════════════════════════════════════
    // STEP 1: BUSCAR GRUPOS
    // ═══════════════════════════════════════════════════════════
    
    console.log('📚 [CurseducaAdapter] Step 1/4: Buscando grupos...')
    
    const groupsResponse = await axios.get(`${CURSEDUCA_API_URL}/groups`, { headers })
    
    let allGroups: CursEducaGroup[] = Array.isArray(groupsResponse.data)
      ? groupsResponse.data
      : groupsResponse.data?.data || groupsResponse.data?.groups || []

    // Filtrar apenas Clareza
    allGroups = allGroups.filter(g => g.name.toLowerCase().includes('clareza'))

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
    // STEP 2: BUSCAR MEMBROS DE CADA GRUPO
    // ═══════════════════════════════════════════════════════════
    
    console.log('👥 [CurseducaAdapter] Step 2/4: Buscando membros...')
    
    const allMembersWithMetadata: CursEducaMemberWithMetadata[] = []
    const errors: string[] = []

    for (const group of allGroups) {
      try {
        console.log(`   📚 Processando grupo: ${group.name} (ID: ${group.id})`)
        
        const rawMembers = await fetchAllGroupMembers(group.id, headers)

        // Adicionar metadata de grupo
        for (const member of rawMembers) {
          try {
            validateCurseducaMember(member)
            
            allMembersWithMetadata.push({
              ...member,
              groupId: group.id,
              groupName: group.name,
              subscriptionType: detectSubscriptionType(group.name) || 'MONTHLY'
            })
          } catch (error: any) {
            errors.push(`${member.email || 'unknown'}: ${error.message}`)
          }
        }

        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error: any) {
        console.error(`   ❌ Erro ao buscar grupo ${group.name}:`, error.message)
        errors.push(`Grupo ${group.name}: ${error.message}`)
      }
    }

    console.log(`✅ [CurseducaAdapter] ${allMembersWithMetadata.length} membros obtidos (com duplicados)`)

    // ═══════════════════════════════════════════════════════════
    // STEP 3: DEDUPLICA (marca isPrimary)
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔄 [CurseducaAdapter] Step 3/4: Deduplicando membros...')
    
    const deduplicated = deduplicateMembers(allMembersWithMetadata)

    // Stats
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
    // STEP 4: NORMALIZAR PARA UNIVERSAL SYNC
    // ═══════════════════════════════════════════════════════════
    
    console.log('🔄 [CurseducaAdapter] Step 4/4: Normalizando dados...')

    const normalized = deduplicated.map(m => normalizeCurseducaMember(m))

    const duration = Math.floor((Date.now() - startTime) / 1000)

    console.log('✅ [CurseducaAdapter] Dados preparados!')
    console.log(`   ⏱️ Duração: ${duration}s`)
    console.log(`   ✅ Total: ${normalized.length}`)
    console.log(`   ❌ Erros: ${errors.length}`)

    if (errors.length > 0) {
      console.warn('⚠️ [CurseducaAdapter] Erros:', errors.slice(0, 5))
    }

    return normalized

  } catch (error: any) {
    console.error('❌ [CurseducaAdapter] Erro fatal:', error)
    throw new Error(`Adapter falhou: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: FETCH APENAS PROGRESSO
// ═══════════════════════════════════════════════════════════

export const fetchProgressForExistingUsers = async (
  userIds: string[]
): Promise<Map<string, { estimatedProgress: number }>> => {
  console.log(`📊 [CurseducaAdapter] Progresso para ${userIds.length} utilizadores...`)
  console.warn('⚠️ CursEduca não tem endpoint dedicado de progresso')
  console.info('   💡 Use fetchCurseducaDataForSync completo')
  
  return new Map()
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  fetchCurseducaDataForSync,
  fetchProgressForExistingUsers
}