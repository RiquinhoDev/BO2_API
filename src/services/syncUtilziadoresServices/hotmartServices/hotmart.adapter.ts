// ════════════════════════════════════════════════════════════
// 📁 src/services/syncUtilziadoresServices/hotmartServices/hotmart.adapter.ts
// Hotmart Adapter - Ponte para Universal Sync
// ════════════════════════════════════════════════════════════

import { UniversalSourceItem } from '../universalSyncService'
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

/**
 * Tipo de saída do adapter, já compatível com UniversalSync.
 * - estende UniversalSourceItem (inclui index signature)
 * - força email/name/hotmartUserId como obrigatórios
 * - progress com o shape que o Universal Sync processa
 */
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
  console.log('🚀 [HotmartAdapter] Iniciando busca de dados para sync...')
  console.log('   📊 Opções:', options)

  const startTime = Date.now()

  try {
    // STEP 1: AUTENTICAÇÃO
    console.log('🔐 [HotmartAdapter] Step 1/4: Autenticação...')
    const accessToken = await hotmartHelpers.getHotmartAccessToken()

    // STEP 2: BUSCAR UTILIZADORES
    console.log('📡 [HotmartAdapter] Step 2/4: Buscando utilizadores...')
    const rawUsers = await hotmartHelpers.fetchAllHotmartUsers(accessToken)

    if (rawUsers.length === 0) {
      console.warn('⚠️ [HotmartAdapter] Nenhum utilizador encontrado!')
      return []
    }

    console.log(`✅ [HotmartAdapter] ${rawUsers.length} utilizadores encontrados`)

    // STEP 3: BUSCAR PROGRESSO (SE NECESSÁRIO)
    let progressMap = new Map<string, ProgressData>()

    if (options.includeProgress && options.includeLessons) {
      console.log('📊 [HotmartAdapter] Step 3/4: Buscando progresso...')

      progressMap = await hotmartHelpers.fetchBatchUserProgress(
        rawUsers,
        accessToken,
        options.progressConcurrency || 5
      )

      console.log(`✅ [HotmartAdapter] ${progressMap.size} utilizadores com progresso`)
    } else {
      console.log('⏭️ [HotmartAdapter] Step 3/4: Progresso ignorado (opções)')
    }

    // STEP 4: NORMALIZAR DADOS
    console.log('🔄 [HotmartAdapter] Step 4/4: Normalizando dados...')

    const normalizedUsers: UniversalSyncUserData[] = []
    const errors: string[] = []

    for (const rawUser of rawUsers) {
      try {
        // valida o rawUser (assumindo que lança se faltar email/id/etc.)
        hotmartHelpers.validateHotmartUser(rawUser)

        const hotmartId =
          (rawUser as any).id ||
          (rawUser as any).user_id ||
          (rawUser as any).uid ||
          (rawUser as any).code

        const hotmartUserId = String(hotmartId)

        const progressData = hotmartUserId ? progressMap.get(hotmartUserId) : undefined

        // Mantemos a normalização existente
        const normalized = hotmartHelpers.normalizeHotmartUser(rawUser, progressData) as Partial<UniversalSourceItem> &
          Partial<Record<string, unknown>>

        // 🔥 Aqui é a parte importante: alinhar progress ao shape do UniversalSync
        const universalProgress: UniversalSourceItem['progress'] = progressData
          ? {
              completed: (progressData as any).completed ?? 0,
              lessons: Array.isArray((progressData as any).lessons) ? (progressData as any).lessons : []
            }
          : undefined

        const email = String((normalized.email ?? (rawUser as any).email) || '').trim()
        const name = String((normalized.name ?? (rawUser as any).name) || '').trim()

        normalizedUsers.push({
          ...(normalized as UniversalSourceItem),
          email,
          name: name || email,
          hotmartUserId,
          // sobrescreve com shape compatível
          progress: universalProgress
        })
      } catch (error: any) {
        errors.push(`${(rawUser as any).email || 'unknown'}: ${error.message}`)
      }
    }

    // STEP 5: RESULTADOS
    const duration = Math.floor((Date.now() - startTime) / 1000)

    console.log('✅ [HotmartAdapter] Dados preparados!')
    console.log(`   ⏱️ Duração: ${duration}s`)
    console.log(`   ✅ Válidos: ${normalizedUsers.length}`)
    console.log(`   ❌ Erros: ${errors.length}`)

    if (errors.length > 0) {
      console.warn('⚠️ [HotmartAdapter] Erros de validação:', errors.slice(0, 5))
    }

    return normalizedUsers
  } catch (error: any) {
    console.error('❌ [HotmartAdapter] Erro fatal:', error)
    throw new Error(`Adapter falhou: ${error.message}`)
  }
}

// ═══════════════════════════════════════════════════════════
// HELPER: FETCH APENAS PROGRESSO (USERS EXISTENTES)
// ═══════════════════════════════════════════════════════════

export const fetchProgressForExistingUsers = async (
  userIds: string[]
): Promise<Map<string, ProgressData>> => {
  console.log(`📊 [HotmartAdapter] Buscando progresso para ${userIds.length} utilizadores...`)

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
          console.warn(`⚠️ Erro ao buscar progresso do user ${userId}`)
        }
      })

      await Promise.all(promises)

      if (i + batchSize < userIds.length) {
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 100)
        })
      }
    }

    console.log(`✅ [HotmartAdapter] ${progressMap.size} progressos obtidos`)
    return progressMap
  } catch (error: any) {
    console.error('❌ [HotmartAdapter] Erro ao buscar progresso:', error)
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
