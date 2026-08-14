import logger from '../../../utils/logger'
import axios from 'axios'
import { UniversalSourceItem } from '../../../types/universalSync.types'
import { assertProviderReadBatchSize } from '../../../security/providerReadBatchPolicy'
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
): Promise<UniversalSourceItem[]> => {
  logger.info('🚀 [CurseducaAdapter] Iniciando busca de dados para sync...')
  logger.info('   📊 Opções:', options)
  logger.info(`   🔄 Estratégia: ${options.enrichWithDetails ? 'Híbrida (2 endpoints)' : 'Simples (1 endpoint)'}`)

  const startTime = Date.now()

  try {
    const headers = getRequestHeaders()

    logger.info('📚 [CurseducaAdapter] Step 1/5: Buscando grupos...')

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
        throw new Error(`Grupo não encontrado: ${options.groupId}`)
      }

      logger.info(`   🎯 Filtrando apenas grupo: ${allGroups[0].name}`)
    }

    logger.info(`✅ [CurseducaAdapter] ${allGroups.length} grupos Clareza encontrados`)

    if (allGroups.length === 0) {
      logger.warn('⚠️ [CurseducaAdapter] Nenhum grupo Clareza encontrado!')
      return []
    }

    logger.info('👥 [CurseducaAdapter] Step 2/6: Buscando lista de membros (HÍBRIDO)...')
    logger.info('   💡 Usando 2 endpoints para capturar TODOS os users:')
    logger.info('   1️⃣  /reports/group/members (users com enrollments)')
    logger.info('   2️⃣  /groups/{groupId}/members (TODOS, incluindo admins)')

    logger.info('   Buscando relatorio de acessos para engagement...')
    const accessReport = await fetchAccessReport(headers)

    const allMembersMap = await fetchAllMembersMap(headers)
    const allMembersWithMetadata: CursEducaMemberWithMetadata[] = []
    const errors: string[] = []

    for (const group of allGroups) {
      try {
        logger.info(`   📚 Processando grupo: ${group.name} (ID: ${group.id})`)
        logger.info(`   📡 1/2: Buscando lista via /groups/${group.id}/members...`)

        const groupMembersResponse = await axios.get<CollectionPayload<CursEducaRosterMember>>(
          `${curseducaApiUrl()}/groups/${group.id}/members`,
          {
            headers,
            params: { limit: 1000 },
            timeout: 30000
          }
        )

        const allGroupMembers = collectionItems(groupMembersResponse.data)

        logger.info(`   ✅ ${allGroupMembers.length} members encontrados`)
        logger.info(`   📡 2/2: Buscando progresso via /reports/group/members...`)
        const membersWithProgress = await fetchGroupMembersList(group.id, headers)
        logger.info(`   ✅ ${membersWithProgress.length} members com dados de progresso`)

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
            enteredAt: gm.enteredAt,
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

        logger.info(`   ✅ Dados mesclados: ${unifiedMembersList.length} members com progresso`)

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
            logger.info(`   Progresso extra aplicado: ${updatedCount} members`)
          }
        }

        if (options.enrichWithDetails) {
          logger.info('   🔄 Enriquecendo via mapa em massa (situation, lastLogin)...')

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

          logger.info(`      Enriquecidos ${enrichedCount}/${unifiedMembersList.length} (${skippedOtherGroup} de outros grupos ignorados, 0 chamadas individuais)`)
        } else {
          logger.info('   ℹ️  Modo simples (sem fetch de detalhes)')

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
        logger.error(`   ❌ Erro ao processar grupo ${group.name}:`, errorMessage(error))
        errors.push(`Grupo ${group.name}: ${errorMessage(error)}`)
      }
    }

    logger.info(`✅ [CurseducaAdapter] ${allMembersWithMetadata.length} membros processados`)
    logger.info('🔄 [CurseducaAdapter] Step 4/5: Deduplicando membros...')

    const deduplicated = deduplicateMembers(allMembersWithMetadata)

    const stats = {
      total: deduplicated.length,
      unique: deduplicated.filter(m => m.isPrimary).length,
      duplicates: deduplicated.filter(m => m.isDuplicate && !m.isPrimary).length
    }

    logger.info('✅ [CurseducaAdapter] Deduplicação completa:')
    logger.info(`   📦 Total produtos: ${stats.total}`)
    logger.info(`   📧 Users únicos: ${stats.unique}`)
    logger.info(`   🔁 Produtos secundários: ${stats.duplicates}`)

    logger.info('🔄 [CurseducaAdapter] Step 5/5: Normalizando dados...')

    const normalized = attachCurseducaMemberships(
      deduplicated.map(m => normalizeCurseducaMember(m)),
    )
    assertProviderReadBatchSize(normalized.length, 'curseduca')

    const duration = Math.floor((Date.now() - startTime) / 1000)

    logger.info('✅ [CurseducaAdapter] Dados preparados!')
    logger.info(`   ⏱️ Duração: ${duration}s`)
    logger.info(`   ✅ Total: ${normalized.length}`)
    logger.info(`   ❌ Erros: ${errors.length}`)

    if (errors.length > 0) {
      logger.warn('⚠️ [CurseducaAdapter] Erros:', errors.slice(0, 5))
      if (errors.length > 5) {
        logger.warn(`   ... e mais ${errors.length - 5} erros`)
      }
    }

    return normalized
  } catch (error: unknown) {
    logger.error('❌ [CurseducaAdapter] Erro fatal:', error)

    if (errorStatus(error) === 401) {
      throw new Error(
        `Adapter falhou: Autenticação inválida (401)\n` +
        `Verifique as credenciais CursEduca na configuração de arranque`
      )
    }

    throw new Error(`Adapter falhou: ${errorMessage(error)}`)
  }
}
