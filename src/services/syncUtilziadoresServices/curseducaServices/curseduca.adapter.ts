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

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_AccessToken
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY

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
    lastAccess: member.lastLogin,
    lastLogin: member.lastLogin,
    enrolledAt: member.enrolledAt ? new Date(member.enrolledAt) : new Date(),
    joinedDate: member.enrolledAt ? new Date(member.enrolledAt) : new Date(),
    expiresAt: member.expiresAt ? new Date(member.expiresAt) : undefined,
    progress: {
      percentage: member.progress || 0,
      completed: 0,
      lessons: []
    },
    engagement: {
      engagementScore: member.progress ? Math.min(100, member.progress * 2) : 0
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
          params: { groupId, limit, offset },
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
// ENRICH: COMBINAR DADOS DOS 2 ENDPOINTS
// ═══════════════════════════════════════════════════════════

async function enrichMemberWithDetails(
  member: CursEducaMemberFromReports,
  groupId: number,
  groupName: string,
  headers: Record<string, string>
): Promise<CursEducaMemberWithMetadata> {
  
  const baseMember: CursEducaMemberWithMetadata = {
    id: member.id,
    uuid: member.uuid,
    name: member.name,
    email: member.email,
    progress: member.progress,
    enrollmentsCount: member.enrollmentsCount,
    groupId,
    groupName,
    subscriptionType: detectSubscriptionType(groupName) || 'MONTHLY',
    enrolledAt: new Date().toISOString(),
    expiresAt: member.expiresAt,
    situation: 'ACTIVE',
    lastLogin: undefined
  }
  
  const details = await fetchMemberDetails(member.id, headers)
  
  if (details) {
    const groupInDetails = details.groups.find(g => g.group.id === groupId)
    
    baseMember.situation = details.situation
    baseMember.lastLogin = details.lastLogin
    baseMember.enrolledAt = groupInDetails?.createdAt || details.createdAt
  }
  
  return baseMember
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
    // STEP 2: BUSCAR LISTA DE MEMBROS
    // ═══════════════════════════════════════════════════════════
    
    console.log('👥 [CurseducaAdapter] Step 2/5: Buscando lista de membros (com progresso)...')
    
    const allMembersWithMetadata: CursEducaMemberWithMetadata[] = []
    const errors: string[] = []

    for (const group of allGroups) {
      try {
        console.log(`   📚 Processando grupo: ${group.name} (ID: ${group.id})`)
        
        const membersList = await fetchGroupMembersList(group.id, headers)
        
        console.log(`   ℹ️  Encontrados ${membersList.length} membros neste grupo`)

        // ═══════════════════════════════════════════════════════════
        // STEP 3: ENRIQUECER COM DETALHES
        // ═══════════════════════════════════════════════════════════
        
        if (options.enrichWithDetails) {
          console.log(`   🔄 Buscando detalhes (lastLogin, situation)...`)
          
          const concurrency = options.progressConcurrency || 5
          const enrichedMembers: CursEducaMemberWithMetadata[] = []
          
          for (let i = 0; i < membersList.length; i += concurrency) {
            const batch = membersList.slice(i, i + concurrency)
            
            const batchPromises = batch.map(member => 
              enrichMemberWithDetails(member, group.id, group.name, headers)
            )
            
            const batchResults = await Promise.all(batchPromises)
            enrichedMembers.push(...batchResults)
            
            if (i + concurrency < membersList.length) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
            
            const processed = Math.min(i + concurrency, membersList.length)
            console.log(`      Processados ${processed}/${membersList.length}`)
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
          
          for (const member of membersList) {
            try {
              validateCurseducaMember(member)
              
              allMembersWithMetadata.push({
                id: member.id,
                uuid: member.uuid,
                name: member.name,
                email: member.email,
                progress: member.progress,
                enrollmentsCount: member.enrollmentsCount,
                groupId: group.id,
                groupName: group.name,
                subscriptionType: detectSubscriptionType(group.name) || 'MONTHLY',
                enrolledAt: new Date().toISOString(),
                expiresAt: member.expiresAt,
                situation: 'ACTIVE',
                lastLogin: undefined
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
// PLACEHOLDER
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
// EXPORTS
// ═══════════════════════════════════════════════════════════

export default {
  fetchCurseducaDataForSync,
  fetchProgressForExistingUsers
}