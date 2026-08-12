import logger from '../../../utils/logger'
import axios from 'axios'
import { UniversalSourceItem } from '../../../types/universalSync.types'
import { CursEducaMemberDetails } from '../../../types/curseduca.types'
import {
  CollectionPayload,
  CurseducaEnrollment,
  collectionItems,
  curseducaApiUrl,
  detectSubscriptionType,
  errorMessage,
  errorStatus,
  getRequestHeaders
} from './curseducaAdapterSupport'
export const fetchSingleUserData = async (
  curseducaUserId: number
): Promise<UniversalSourceItem[]> => {
  logger.info(`ðŸ” [CurseducaAdapter] Buscando dados do user ${curseducaUserId}...`)

  try {
    const headers = getRequestHeaders()

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 1: GET /members/{id} - Dados completos do user
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    logger.info(`   ðŸ“¡ Buscando dados bÃ¡sicos...`)
    const memberResponse = await axios.get<CursEducaMemberDetails>(
      `${curseducaApiUrl()}/members/${curseducaUserId}`,
      { headers, timeout: 15000 }
    )

    const memberData = memberResponse.data
    logger.info(`   âœ… User: ${memberData.email}`)
    logger.info(`   ðŸ“Š Groups: ${memberData.groups.length}`)

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 2: GET /api/reports/enrollments?memberId={id}
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    logger.info(`   ðŸ“¡ Buscando enrollments...`)

    let enrollments: CurseducaEnrollment[] = []

    try {
      const enrollmentsResponse = await axios.get<CollectionPayload<CurseducaEnrollment>>(
        `${curseducaApiUrl()}/api/reports/enrollments`,
        {
          params: { memberId: curseducaUserId, limit: 100 },
          headers,
          timeout: 15000
        }
      )

      enrollments = collectionItems(enrollmentsResponse.data)
      logger.info(`   âœ… Enrollments: ${enrollments.length}`)

    } catch (enrollmentError: unknown) {
      if (errorStatus(enrollmentError) === 404) {
        logger.info(`   âš ï¸  Nenhum enrollment encontrado (404)`)
        logger.info(`   â„¹ï¸  Usando apenas dados dos groups (user pode ser admin)`)
        enrollments = []
      } else {
        throw enrollmentError
      }
    }

    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // STEP 3: MAPEAR ENROLLMENTS â†’ UNIVERSAL SOURCE ITEMS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

    const results: UniversalSourceItem[] = []

    if (enrollments.length > 0) {
      // CASO A: Tem enrollments - usar dados do enrollment
      for (const enrollment of enrollments) {
        // Encontrar grupo correspondente
        const group = memberData.groups.find(
          g => g.group.id === enrollment.content?.id
        )

        if (!group) {
          logger.warn(`   âš ï¸ Grupo ${enrollment.content?.id} nÃ£o encontrado para enrollment`)
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
      logger.info(`   ðŸ“¦ Criando items baseados em ${memberData.groups.length} group(s)...`)

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

    logger.info(`âœ… [CurseducaAdapter] ${results.length} items criados para user ${curseducaUserId}`)

    return results

  } catch (error: unknown) {
    logger.error(`âŒ [CurseducaAdapter] Erro ao buscar user ${curseducaUserId}:`, errorMessage(error))

    if (errorStatus(error) === 404) {
      logger.error(`   User ${curseducaUserId} nÃ£o encontrado no CursEduca`)
      return []
    }

    throw new Error(`Erro ao buscar dados do user ${curseducaUserId}: ${errorMessage(error)}`)
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PLACEHOLDER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

export const fetchProgressForExistingUsers = async (
  userIds: string[]
): Promise<Map<string, { estimatedProgress: number }>> => {
  logger.info(`ðŸ“Š [CurseducaAdapter] Progresso para ${userIds.length} utilizadores...`)
  logger.warn('âš ï¸ CursEduca nÃ£o tem endpoint dedicado de progresso')
  logger.info('   ðŸ’¡ Use fetchCurseducaDataForSync completo ou fetchSingleUserData')
  return new Map()
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// EXPORTS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

