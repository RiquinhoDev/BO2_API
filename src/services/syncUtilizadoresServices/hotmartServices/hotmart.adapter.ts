import logger from '../../../utils/logger'
// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter.ts
// Hotmart Adapter - Ponte para Universal Sync
// ✅ VERSÃO COMPLETA: Retorna TODOS os campos necessários
// ════════════════════════════════════════════════════════════


import { UniversalSourceItem } from '../../../types/universalSync.types'
import hotmartHelpers from './hotmart.helpers'
import type { ProgressData } from './hotmart.helpers'

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface HotmartSyncOptions {
  includeProgress: boolean
  includeLessons: boolean
  progressConcurrency?: number
}

export type UniversalSyncUserData =
  Omit<UniversalSourceItem, 'email' | 'name' | 'hotmartUserId' | 'progress'> & {
    email: string
    name: string
    hotmartUserId: string
    progress?: UniversalSourceItem['progress']
  }

// ═══════════════════════════════════════════════════════════
// MAIN ADAPTER FUNCTION
// ═══════════════════════════════════════════════════════════

export const fetchHotmartDataForSync = async (
  options: HotmartSyncOptions = {
    includeProgress: true,
    includeLessons: true,
    progressConcurrency: 5
  }
): Promise<UniversalSyncUserData[]> => {
  logger.info('🚀 [HotmartAdapter] Iniciando busca de dados para sync...')
  logger.info('   📊 Opções:', options)

  const startTime = Date.now()

  try {
    // STEP 1: AUTENTICAÇÃO
    logger.info('🔐 [HotmartAdapter] Step 1/4: Autenticação...')
    const accessToken = await hotmartHelpers.getHotmartAccessToken()

    // STEP 2: BUSCAR UTILIZADORES
    logger.info('📡 [HotmartAdapter] Step 2/4: Buscando utilizadores...')
    const rawUsers = await hotmartHelpers.fetchAllHotmartUsers(accessToken)

    if (rawUsers.length === 0) {
      logger.warn('⚠️ [HotmartAdapter] Nenhum utilizador encontrado!')
      return []
    }

    logger.info(`✅ [HotmartAdapter] ${rawUsers.length} utilizadores encontrados`)

    // STEP 3: BUSCAR PROGRESSO (SE NECESSÁRIO)
    let progressMap = new Map<string, ProgressData>()

    if (options.includeProgress && options.includeLessons) {
      logger.info('📊 [HotmartAdapter] Step 3/4: Buscando progresso...')
      logger.info(`   👥 ${rawUsers.length} users para processar`)
      logger.info(`   🔢 Concurrency: ${options.progressConcurrency || 2}`)
      logger.info(`   ⏱️  Tempo estimado: ${Math.ceil(rawUsers.length / (options.progressConcurrency || 2) * 0.5 / 60)} minutos`)
      logger.info('   ☕ Isto pode demorar - vai buscar um café!')

      const progressStart = Date.now()

      progressMap = await hotmartHelpers.fetchBatchUserProgress(
        rawUsers,
        accessToken,
        options.progressConcurrency || 2
      )

      const progressDuration = Math.floor((Date.now() - progressStart) / 1000)
      logger.info(`✅ [HotmartAdapter] Progresso obtido em ${progressDuration}s (${Math.floor(progressDuration / 60)} min)`)
      logger.info(`   📊 ${progressMap.size}/${rawUsers.length} users com progresso`)
    } else {
      logger.info('⏭️ [HotmartAdapter] Step 3/4: Progresso ignorado (opções)')
    }

    // STEP 4: NORMALIZAR DADOS (✅ VERSÃO COMPLETA)
    logger.info('🔄 [HotmartAdapter] Step 4/4: Normalizando dados...')

    const normalizedUsers: UniversalSyncUserData[] = []
    const errors: string[] = []

    for (const rawUser of rawUsers) {
      try {
        // Validar
        hotmartHelpers.validateHotmartUser(rawUser)

        const hotmartId =
  (rawUser as any).id ||
  (rawUser as any).user_id ||
  (rawUser as any).uid ||
  (rawUser as any).code

if (!hotmartId) {
  throw new Error('Hotmart user sem ID válido')
}

  const hotmartUserId = String(hotmartId)
  const progressData = progressMap.get(hotmartUserId)

  // normalizas (pode devolver hotmartUserId opcional, não interessa)
  const normalized = hotmartHelpers.normalizeHotmartUser(rawUser, progressData)

  normalizedUsers.push({
    email: normalized.email,
    name: normalized.name,

    // ✅ usa o ID garantido
    hotmartUserId,

    purchaseDate: normalized.purchaseDate,
    signupDate: normalized.signupDate,
    firstAccessDate: normalized.firstAccessDate,
    lastAccessDate: normalized.lastAccessDate,

    plusAccess: normalized.plusAccess,

    classId: normalized.classId,
    className: normalized.className,

    accessCount: normalized.accessCount,
    engagementLevel: normalized.engagementLevel,
    engagement: {
      engagementScore: normalized.accessCount || 0
    },

    // ✅ NOVOS CAMPOS DA API HOTMART
    status: normalized.status,
    role: normalized.role,
    type: normalized.type,
    locale: normalized.locale,
    isDeletable: normalized.isDeletable,

    platformData: {
      raw: rawUser,
      progress: progressData || null,
      // ✅ Guardar todos os campos adicionais no platformData
      hotmart: {
        status: normalized.status,
        role: normalized.role,
        type: normalized.type,
        locale: normalized.locale,
        isDeletable: normalized.isDeletable,
      }
    },

    progress: progressData
      ? {
          percentage: progressData.completedPercentage || 0,
          completed: progressData.completed || 0,
          total: progressData.total || 0,
          lessons: progressData.lessons || [],
          // ✅ MÓDULOS - Adicionar campos de módulos
          modulesList: progressData.modulesList || [],
          totalModules: progressData.totalModules || 0,
          modulesCompleted: progressData.modulesCompleted || [],
          currentModule: progressData.currentModule
        }
      : {
          percentage: 0,
          completed: 0,
          total: 0,
          lessons: [],
          modulesList: [],
          totalModules: 0,
          modulesCompleted: [],
          currentModule: undefined
        }
  })
      } catch (error: any) {
        errors.push(`${(rawUser as any).email || 'unknown'}: ${error.message}`)
      }
    }

    // STEP 5: RESULTADOS
    const duration = Math.floor((Date.now() - startTime) / 1000)

    logger.info('✅ [HotmartAdapter] Dados preparados!')
    logger.info(`   ⏱️ Duração: ${duration}s`)
    logger.info(`   ✅ Válidos: ${normalizedUsers.length}`)
    logger.info(`   ❌ Erros: ${errors.length}`)

    if (errors.length > 0) {
      logger.warn('⚠️ [HotmartAdapter] Erros de validação:', errors.slice(0, 5))
    }

    return normalizedUsers
  } catch (error: any) {
    logger.error('❌ [HotmartAdapter] Erro fatal:', error)
    throw new Error(`Adapter falhou: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: FETCH APENAS PROGRESSO (USERS EXISTENTES)
// ═══════════════════════════════════════════════════════════

export const fetchProgressForExistingUsers = async (
  userIds: string[]
): Promise<Map<string, ProgressData>> => {
  logger.info(`📊 [HotmartAdapter] Buscando progresso para ${userIds.length} utilizadores...`)

  try {
    const accessToken = await hotmartHelpers.getHotmartAccessToken()
    const progressMap = new Map<string, ProgressData>()

    const batchSize = 10
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)

      const promises = batch.map(async (userId) => {
        try {
          const lessons = await hotmartHelpers.fetchUserLessons(userId, accessToken)
          if (lessons.length > 0) {
            const progress = hotmartHelpers.calculateProgress(lessons)
            progressMap.set(userId, progress)
          }
        } catch {
          logger.warn(`⚠️ Erro ao buscar progresso do user ${userId}`)
        }
      })

      await Promise.all(promises)

      if (i + batchSize < userIds.length) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 100)
        })
      }
    }

    logger.info(`✅ [HotmartAdapter] ${progressMap.size} progressos obtidos`)
    return progressMap
  } catch (error: any) {
    logger.error('❌ [HotmartAdapter] Erro ao buscar progresso:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

export default {
  fetchHotmartDataForSync,
  fetchProgressForExistingUsers
}
