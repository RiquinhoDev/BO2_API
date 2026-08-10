import axios from 'axios'
import { UniversalSourceItem } from '../../../types/universalSync.types'
import {
  CurseducaSyncOptions,
  CursEducaGroup,
  CursEducaMemberFromReports,
  CursEducaMemberWithMetadata
} from '../../../types/curseduca.types'
import { attachCurseducaMemberships } from './curseducaMemberships'
import {
  CollectionPayload,
  CursEducaRosterMember,
  UnifiedCurseducaMember,
  collectionItems,
  curseducaApiUrl,
  deduplicateMembers,
  detectSubscriptionType,
  errorMessage,
  errorStatus,
  getRequestHeaders,
  normalizeEmail,
  normalizeCurseducaMember,
  validateCurseducaMember,
  validateCurseducaMemberExtended
} from './curseducaAdapterSupport'
import {
  enrichMemberFromBulk,
  fetchAccessReport,
  fetchAllMembersMap,
  fetchGroupMembersList,
  fetchProgressReport
} from './curseducaReports.client'
export const fetchCurseducaDataForSync = async (
  options: CurseducaSyncOptions = {
    includeProgress: true,
    includeGroups: true,
    progressConcurrency: 5,
    enrichWithDetails: true
  }
): Promise<UniversalSourceItem[]> => {  // âœ… CORRIGIDO!
  
  console.log('ðŸš€ [CurseducaAdapter] Iniciando busca de dados para sync...')
  console.log('   ðŸ“Š OpÃ§Ãµes:', options)
  console.log(`   ðŸ”„ EstratÃ©gia: ${options.enrichWithDetails ? 'HÃ­brida (2 endpoints)' : 'Simples (1 endpoint)'}`)

  const startTime = Date.now()

  try {
    // âœ… VALIDAR CREDENCIAIS
    const headers = getRequestHeaders()

    // âœ… CRIAR HEADERS UMA ÃšNICA VEZ
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 1: BUSCAR GRUPOS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    
    console.log('ðŸ“š [CurseducaAdapter] Step 1/5: Buscando grupos...')
    
    const groupsResponse = await axios.get<CollectionPayload<CursEducaGroup>>(`${curseducaApiUrl()}/groups`, {
      headers,
      timeout: 30000
    })
    
    let allGroups = collectionItems(groupsResponse.data)
    
    allGroups = allGroups.filter(g => 
      g.name.toLowerCase().includes('clareza')
    )

    if (options.groupId) {
      allGroups = allGroups.filter(g => 
        g.id.toString() === options.groupId || 
        g.uuid === options.groupId
      )
      
      if (allGroups.length === 0) {
        throw new Error(`Grupo nÃ£o encontrado: ${options.groupId}`)
      }
      
      console.log(`   ðŸŽ¯ Filtrando apenas grupo: ${allGroups[0].name}`)
    }

    console.log(`âœ… [CurseducaAdapter] ${allGroups.length} grupos Clareza encontrados`)
    
    if (allGroups.length === 0) {
      console.warn('âš ï¸ [CurseducaAdapter] Nenhum grupo Clareza encontrado!')
      return []
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 2: BUSCAR LISTA DE MEMBROS (ESTRATÃ‰GIA HÃBRIDA)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log('ðŸ‘¥ [CurseducaAdapter] Step 2/6: Buscando lista de membros (HÃBRIDO)...')
    console.log('   ðŸ’¡ Usando 2 endpoints para capturar TODOS os users:')
    console.log('   1ï¸âƒ£  /reports/group/members (users com enrollments)')
    console.log('   2ï¸âƒ£  /groups/{groupId}/members (TODOS, incluindo admins)')

    console.log('   Buscando relatorio de acessos para engagement...')
    const accessReport = await fetchAccessReport(headers)

    // ðŸš€ Buscar situation/lastAccess de TODOS os membros de uma vez (paginado),
    // em vez de 1 chamada /members/{id} por membro (que sofre de 504s).
    const allMembersMap = await fetchAllMembersMap(headers)
    const allMembersWithMetadata: CursEducaMemberWithMetadata[] = []
    const errors: string[] = []

    for (const group of allGroups) {
      try {
        console.log(`   ðŸ“š Processando grupo: ${group.name} (ID: ${group.id})`)

        // STEP 1: Buscar lista completa via /groups/{id}/members
        console.log(`   ðŸ“¡ 1/2: Buscando lista via /groups/${group.id}/members...`)

        const groupMembersResponse = await axios.get<CollectionPayload<CursEducaRosterMember>>(
          `${curseducaApiUrl()}/groups/${group.id}/members`,
          {
            headers,
            params: { limit: 1000 },
            timeout: 30000
          }
        )

        const allGroupMembers = collectionItems(groupMembersResponse.data)

        console.log(`   âœ… ${allGroupMembers.length} members encontrados`)

        // STEP 2: Buscar progresso via /reports/group/members
        console.log(`   ðŸ“¡ 2/2: Buscando progresso via /reports/group/members...`)
        const membersWithProgress = await fetchGroupMembersList(group.id, headers)
        console.log(`   âœ… ${membersWithProgress.length} members com dados de progresso`)

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
        const unifiedMembersList: UnifiedCurseducaMember[] = allGroupMembers.map(gm => {
          const emailKey = normalizeEmail(gm.email)
          if (emailKey) membersByEmail.add(emailKey)

          const withProgress = progressById.get(gm.id) || (emailKey ? progressByEmail.get(emailKey) : undefined)
          const accessInfo = emailKey ? accessReport.get(emailKey) : undefined

          return {
            id: gm.id,
            uuid: gm.uuid,
            name: gm.name,
            email: gm.email,
            enteredAt: gm.enteredAt, // data de entrada no grupo (roster) -> enrolledAt
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


        console.log(`   âœ… Dados mesclados: ${unifiedMembersList.length} members com progresso`)

        const progressReport = await fetchProgressReport(group.id, group.name, headers)
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


        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
        // STEP 3: ENRIQUECER COM DETALHES
        // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

        if (options.enrichWithDetails) {
          console.log(`   ðŸ”„ Enriquecendo via mapa em massa (situation, lastLogin)...`)

          // Sem chamadas 1-a-1 -> sem 504s, sem espera por lotes.
          // Roster autoritativo deste grupo (para a regra de pertenÃ§a).
          const rosterIds = new Set<number>(
            allGroupMembers.map((gm: CursEducaRosterMember) => gm.id)
          )

          let enrichedCount = 0
          let skippedOtherGroup = 0
          for (const member of unifiedMembersList) {
            const enriched = enrichMemberFromBulk(member, group.id, group.name, allMembersMap, rosterIds)
            if (!enriched) { skippedOtherGroup++; continue }
            try {
              validateCurseducaMemberExtended(enriched)
              allMembersWithMetadata.push(enriched)
              enrichedCount++
            } catch (error: unknown) {
              errors.push(`${enriched.email}: ${errorMessage(error)}`)
            }
          }

          console.log(`      Enriquecidos ${enrichedCount}/${unifiedMembersList.length} (${skippedOtherGroup} de outros grupos ignorados, 0 chamadas individuais)`)

        } else {
          console.log(`   â„¹ï¸  Modo simples (sem fetch de detalhes)`)

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
                lastLogin: member.lastLogin,
                lastAccess: member.lastAccess,
                accessCount: member.accessCount
              })

            } catch (error: unknown) {
              errors.push(`${member.email || 'unknown'}: ${errorMessage(error)}`)
            }
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error: unknown) {
        console.error(`   âŒ Erro ao processar grupo ${group.name}:`, errorMessage(error))
        errors.push(`Grupo ${group.name}: ${errorMessage(error)}`)
      }
    }

    console.log(`âœ… [CurseducaAdapter] ${allMembersWithMetadata.length} membros processados`)

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 4: DEDUPLICAR
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    console.log('ðŸ”„ [CurseducaAdapter] Step 4/5: Deduplicando membros...')

    const deduplicated = deduplicateMembers(allMembersWithMetadata)

    const stats = {
      total: deduplicated.length,
      unique: deduplicated.filter(m => m.isPrimary).length,
      duplicates: deduplicated.filter(m => m.isDuplicate && !m.isPrimary).length
    }

    console.log(`âœ… [CurseducaAdapter] DeduplicaÃ§Ã£o completa:`)
    console.log(`   ðŸ“¦ Total produtos: ${stats.total}`)
    console.log(`   ðŸ“§ Users Ãºnicos: ${stats.unique}`)
    console.log(`   ðŸ” Produtos secundÃ¡rios: ${stats.duplicates}`)

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 5: NORMALIZAR
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    
    console.log('ðŸ”„ [CurseducaAdapter] Step 5/5: Normalizando dados...')
    
    const normalized = attachCurseducaMemberships(
      deduplicated.map(m => normalizeCurseducaMember(m)),
    )

    const duration = Math.floor((Date.now() - startTime) / 1000)
    
    console.log('âœ… [CurseducaAdapter] Dados preparados!')
    console.log(`   â±ï¸ DuraÃ§Ã£o: ${duration}s`)
    console.log(`   âœ… Total: ${normalized.length}`)
    console.log(`   âŒ Erros: ${errors.length}`)

    if (errors.length > 0) {
      console.warn('âš ï¸ [CurseducaAdapter] Erros:', errors.slice(0, 5))
      if (errors.length > 5) {
        console.warn(`   ... e mais ${errors.length - 5} erros`)
      }
    }

    return normalized
    
  } catch (error: unknown) {
    console.error('âŒ [CurseducaAdapter] Erro fatal:', error)
    
    if (errorStatus(error) === 401) {
      throw new Error(
        `Adapter falhou: AutenticaÃ§Ã£o invÃ¡lida (401)\n` +
        `Verifique as credenciais CursEduca na configuraÃ§Ã£o de arranque`
      )
    }
    
    throw new Error(`Adapter falhou: ${errorMessage(error)}`)
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ðŸ†• SYNC INDIVIDUAL - ESTRATÃ‰GIA OTIMIZADA (2 CHAMADAS)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

