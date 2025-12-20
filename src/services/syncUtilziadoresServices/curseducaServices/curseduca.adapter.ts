// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilziadoresServices/curseducaServices/curseduca.adapter.ts
// CursEduca Adapter - Ponte para Universal Sync
// ✅ CORRIGIDO: Paginação completa para buscar TODOS os membros
// ════════════════════════════════════════════════════════════

import { UniversalSourceItem } from '../universalSyncService'
import axios from 'axios'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface CurseducaSyncOptions {
  includeProgress: boolean
  includeGroups: boolean
  groupId?: string // Opcional - sync apenas um grupo específico
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

// ✅ NOVO: Interface para resposta paginada da API
interface PaginatedResponse<T> {
  metadata: {
    totalCount: number
    limit: number
    offset: number
    hasMore: boolean
  }
  data: T[]
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
  }

// ═══════════════════════════════════════════════════════════
// ENV VARS
// ═══════════════════════════════════════════════════════════

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_AccessToken
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Detecta subscription type baseado no nome do grupo
 */
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

/**
 * Valida membro CursEduca
 */
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

/**
 * Normaliza membro CursEduca para formato Universal
 */
function normalizeCurseducaMember(
  member: CursEducaMember, 
  group: CursEducaGroup
): UniversalSyncUserData {
  const email = member.email.toLowerCase().trim()
  const name = member.name.trim() || email
  
  return {
    email,
    name,
    curseducaUserId: member.id.toString(),
    curseducaUuid: member.uuid,
    groupId: group.uuid || group.id.toString(),
    groupName: group.name,
    subscriptionType: detectSubscriptionType(group.name),
    progress: {
      estimatedProgress: member.progress || 0,
      activityLevel: member.progress && member.progress > 50 ? 'HIGH' : 
                      member.progress && member.progress > 20 ? 'MEDIUM' : 'LOW'
    },
    joinedDate: member.enteredAt ? new Date(member.enteredAt) : new Date(),
    expiresAt: member.expiresAt ? new Date(member.expiresAt) : undefined,
    enrollmentsCount: member.enrollmentsCount || 0
  }
}

// ═══════════════════════════════════════════════════════════
// ✅ NOVA FUNÇÃO: BUSCAR MEMBROS COM PAGINAÇÃO
// ═══════════════════════════════════════════════════════════

/**
 * Busca TODOS os membros de um grupo com paginação automática
 */
async function fetchAllGroupMembers(
  groupId: number,
  headers: Record<string, string>
): Promise<CursEducaMember[]> {
  const allMembers: CursEducaMember[] = []
  let offset = 0
  const limit = 100 // Buscar 100 por página (máximo permitido pela API)
  let hasMore = true
  let pageCount = 0

  console.log(`   📄 Iniciando paginação para grupo ${groupId}...`)

  while (hasMore) {
    pageCount++
    
    try {
      const response = await axios.get(
        `${CURSEDUCA_API_URL}/reports/group/members`,
        {
          params: { 
            groupId, 
            limit,
            offset 
          },
          headers
        }
      )

      // Extrair membros e metadata
      let pageMembers: CursEducaMember[] = []
      let metadata: PaginatedResponse<CursEducaMember>['metadata'] | null = null

      // Detectar estrutura da resposta
      if (response.data?.metadata && response.data?.data) {
        // Formato paginado completo
        pageMembers = response.data.data
        metadata = response.data.metadata
      } else if (Array.isArray(response.data)) {
        // Array direto (sem metadata)
        pageMembers = response.data
        metadata = null
      } else if (response.data?.data && Array.isArray(response.data.data)) {
        // Objeto com data mas sem metadata
        pageMembers = response.data.data
        metadata = null
      } else if (response.data?.members && Array.isArray(response.data.members)) {
        // Objeto com members
        pageMembers = response.data.members
        metadata = null
      }

      console.log(`      📄 Página ${pageCount}: ${pageMembers.length} membros`)

      // Adicionar membros ao array total
      allMembers.push(...pageMembers)

      // Decidir se há mais páginas
      if (metadata) {
        // Se temos metadata, usar hasMore
        hasMore = metadata.hasMore
        offset += metadata.limit
      } else {
        // Se não temos metadata, parar se recebermos menos que o limit
        hasMore = pageMembers.length === limit
        offset += limit
      }

      // Rate limiting entre páginas (evitar sobrecarga da API)
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 300))
      }

    } catch (error: any) {
      console.error(`   ❌ Erro na página ${pageCount} (offset ${offset}):`, error.message)
      throw error
    }
  }

  console.log(`   ✅ Paginação completa: ${allMembers.length} membros em ${pageCount} páginas`)
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

    // STEP 1: BUSCAR GRUPOS
    console.log('📚 [CurseducaAdapter] Step 1/3: Buscando grupos...')
    
    const groupsResponse = await axios.get(`${CURSEDUCA_API_URL}/groups`, { headers })
    
    let allGroups: CursEducaGroup[] = Array.isArray(groupsResponse.data)
      ? groupsResponse.data
      : groupsResponse.data?.data || groupsResponse.data?.groups || []

    // Filtrar por groupId específico se fornecido
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

    console.log(`✅ [CurseducaAdapter] ${allGroups.length} grupos encontrados`)

    if (allGroups.length === 0) {
      console.warn('⚠️ [CurseducaAdapter] Nenhum grupo encontrado!')
      return []
    }

    // STEP 2: BUSCAR MEMBROS DE CADA GRUPO (COM PAGINAÇÃO!)
    console.log('👥 [CurseducaAdapter] Step 2/3: Buscando membros COM PAGINAÇÃO...')
    
    const allMembers: UniversalSyncUserData[] = []
    const errors: string[] = []
    const processedEmails = new Set<string>() // Deduplicação

    for (const group of allGroups) {
      try {
        console.log(`   📚 Processando grupo: ${group.name} (ID: ${group.id})`)
        
        // ✅ USAR NOVA FUNÇÃO COM PAGINAÇÃO
        const rawMembers = await fetchAllGroupMembers(group.id, headers)

        console.log(`      ✅ Total de membros: ${rawMembers.length}`)

        // Normalizar membros
        for (const rawMember of rawMembers) {
          try {
            validateCurseducaMember(rawMember)
            
            const email = rawMember.email.toLowerCase().trim()
            
            // Deduplicação: Se membro já processado (em outro grupo), skip
            if (processedEmails.has(email)) {
              console.log(`      ⏭️ Skip duplicado: ${email}`)
              continue
            }
            
            const normalized = normalizeCurseducaMember(rawMember, group)
            allMembers.push(normalized)
            processedEmails.add(email)
            
          } catch (error: any) {
            errors.push(`${rawMember.email || 'unknown'}: ${error.message}`)
          }
        }

        // Rate limiting entre grupos
        await new Promise(resolve => setTimeout(resolve, 500))
        
      } catch (error: any) {
        console.error(`   ❌ Erro ao buscar membros do grupo ${group.name}:`, error.message)
        errors.push(`Grupo ${group.name}: ${error.message}`)
      }
    }

    // STEP 3: RESULTADOS
    const duration = Math.floor((Date.now() - startTime) / 1000)

    console.log('✅ [CurseducaAdapter] Dados preparados!')
    console.log(`   ⏱️ Duração: ${duration}s`)
    console.log(`   📚 Grupos processados: ${allGroups.length}`)
    console.log(`   ✅ Membros válidos: ${allMembers.length}`)
    console.log(`   🔄 Emails únicos: ${processedEmails.size}`)
    console.log(`   ❌ Erros: ${errors.length}`)

    if (errors.length > 0) {
      console.warn('⚠️ [CurseducaAdapter] Erros de validação:', errors.slice(0, 5))
    }

    return allMembers
    
  } catch (error: any) {
    console.error('❌ [CurseducaAdapter] Erro fatal:', error)
    throw new Error(`Adapter falhou: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: FETCH APENAS PROGRESSO (USERS EXISTENTES)
// ═══════════════════════════════════════════════════════════

export const fetchProgressForExistingUsers = async (
  userIds: string[]
): Promise<Map<string, { estimatedProgress: number }>> => {
  console.log(`📊 [CurseducaAdapter] Progresso para ${userIds.length} utilizadores...`)
  console.warn('⚠️ CursEduca não tem endpoint dedicado de progresso')
  console.info('   💡 Retornando Map vazio - use fetchCurseducaDataForSync completo')
  
  return new Map()
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  fetchCurseducaDataForSync,
  fetchProgressForExistingUsers
}