// src/controllers/hotmart.controller.ts
// ✅ UNIFICADO: hotmart.controller.ts + hotmartV2.controller.ts + Universal Sync endpoints

import { Request, Response } from 'express'
import { isDevelopmentRuntime } from '../../services/requestDrivenRuntimeConfig'
import { SyncHistory, User } from '../../models'
import hotmartAdapter from '../../services/syncUtilizadoresServices/hotmartServices/hotmart.adapter'
import universalSyncService from '../../services/syncUtilizadoresServices/universalSync'
import { SyncError, SyncProgress, SyncWarning } from '../../types/universalSync.types'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

// ✅ Compatibilidade
export const findHotmartUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.query

    if (!email) {
      res.status(400).json({ message: 'Email é obrigatório' })
      return
    }

    const foundUser = await User.findOne({ email: String(email) })

    if (!foundUser) {
      res.status(404).json({ message: 'Utilizador não encontrado' })
      return
    }

    res.status(200).json({
      message: 'Utilizador encontrado',
      user: {
        id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        hotmartUserId: foundUser.hotmart?.hotmartUserId,
        status: foundUser.combined?.status,
        progress: foundUser.combined?.totalProgress
      }
    })
  } catch (error: unknown) {
    res.status(500).json({ message: 'Erro ao buscar utilizador', error: errorMessage(error) })
  }
}

// ✅ TESTE DA BD
export const testDatabaseConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await User.countDocuments()

    const testUser = await User.create({
      email: 'test-connection@example.com',
      name: 'Test Connection User'
    })

    await User.findByIdAndUpdate(testUser._id, { name: 'Test Updated' }, { new: true })
    await User.findByIdAndDelete(testUser._id)

    res.json({
      success: true,
      message: 'Todos os testes da BD passaram com sucesso',
      userCount,
      testPassed: true,
      connectionStatus: 'OK'
    })
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      message: 'Erro no teste da BD',
      error: errorMessage(error),
      connectionStatus: 'FAILED'
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ UNIVERSAL SYNC ENDPOINTS (NOVOS)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/hotmart/sync/universal
 * Sincronização Hotmart usando Universal Sync Service
 */
export const syncHotmartUsersUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('🚀 [HotmartUniversal] Iniciando sync via Universal Service...')

  try {
    console.log('📡 [HotmartUniversal] Buscando dados via Adapter...')

const hotmartData = await hotmartAdapter.fetchHotmartDataForSync({
  includeProgress: true,
  includeLessons: true,
  progressConcurrency: 5  // ✅ Aumentar de 2 para 5 (mais rápido mas mais carga API)
})

    console.log(`✅ [HotmartUniversal] ${hotmartData.length} utilizadores preparados`)

    if (hotmartData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum utilizador encontrado na Hotmart',
        data: { stats: { total: 0, inserted: 0, updated: 0, errors: 0 } }
      })
      return
    }

    console.log('⚡ [HotmartUniversal] Executando Universal Sync...')

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Hotmart Universal Sync (Manual)',
      triggeredBy: 'MANUAL',
      triggeredByUser: req.user?.id,

      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,

      sourceData: hotmartData,

onProgress: (progress: SyncProgress) => {
  if (progress.current % 100 === 0 || progress.percentage === 100) {
    console.log(`📊 [HotmartUniversal] ${progress.percentage.toFixed(1)}% (${progress.current}/${progress.total})`)
  }
},

onError: (error: SyncError) => {
  console.error(`❌ [HotmartUniversal] Erro: ${error.message}`)
},

onWarning: (warning: SyncWarning) => {
  console.warn(`⚠️ [HotmartUniversal] Aviso: ${warning.message}`)
}

    })

    console.log('✅ [HotmartUniversal] Sync concluída!')
    console.log(`   ⏱️ Duração: ${result.duration}s`)
    console.log(`   ✅ Inseridos: ${result.stats.inserted}`)
    console.log(`   🔄 Atualizados: ${result.stats.updated}`)
    console.log(`   ❌ Erros: ${result.stats.errors}`)

    res.status(200).json({
      success: result.success,
      message: result.success
        ? 'Sincronização via Universal Service concluída com sucesso!'
        : 'Sincronização concluída com erros',
      data: {
        reportId: result.reportId,
        syncHistoryId: result.syncHistoryId,
        stats: result.stats,
        duration: result.duration,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length,
        reportUrl: `/api/sync/reports/${result.reportId}`,
        syncHistoryUrl: `/api/sync/history/${result.syncHistoryId}`
      },
      _universalSync: true,
      _version: '3.0'
    })

  } catch (error: unknown) {
    console.error('❌ [HotmartUniversal] Erro fatal:', error)

    res.status(500).json({
      success: false,
      message: 'Erro ao executar sincronização via Universal Service',
      error: errorMessage(error),
      stack: isDevelopmentRuntime() ? errorStack(error) : undefined
    })
  }
}

/**
 * POST /api/hotmart/sync/universal/progress
 * Sincronizar apenas progresso usando Universal Sync
 */
export const syncProgressOnlyUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('📊 [HotmartProgress] Iniciando sync de progresso via Universal...')

  try {
    const existingUsers = await User.find({
'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }

    }).select('hotmart.hotmartUserId email name').lean()

    console.log(`📊 [HotmartProgress] ${existingUsers.length} utilizadores com Hotmart ID`)

    if (existingUsers.length === 0) {
      res.status(200).json({
        success: true,
        message: 'Nenhum utilizador com Hotmart ID encontrado',
        data: { stats: { total: 0 } }
      })
      return
    }

    const userIds = existingUsers
      .map(user => user.hotmart?.hotmartUserId)
      .filter((userId): userId is string => Boolean(userId))

    const progressMap = await hotmartAdapter.fetchProgressForExistingUsers(userIds)

    const progressData = existingUsers.map(user => {
      const hotmartId = user.hotmart?.hotmartUserId
      const progress = hotmartId ? progressMap.get(hotmartId) : undefined

      return {
        email: user.email,
        name: user.name,
        hotmartUserId: hotmartId,
        progress: progress || undefined
      }
    })

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Hotmart Progress Sync (Universal)',
      triggeredBy: 'MANUAL',
      triggeredByUser: req.user?.id,
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 100,
      sourceData: progressData
    })

    res.status(200).json({
      success: result.success,
      message: 'Progresso sincronizado via Universal Service!',
      data: {
        reportId: result.reportId,
        stats: result.stats,
        duration: result.duration,
        withProgress: progressMap.size
      },
      _universalSync: true
    })

  } catch (error: unknown) {
    console.error('❌ [HotmartProgress] Erro:', error)
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}

/**
 * GET /api/hotmart/sync/compare
 * Comparar resultados: Legacy vs Universal
 */
export const compareSyncMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const SyncReport = (await import('../../models/SyncModels/SyncReport')).default

    const legacyHistory = await SyncHistory.find({ type: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats')
      .lean()

    const universalReports = await SyncReport.find({ syncType: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats duration')
      .lean()

    res.json({
      success: true,
      data: {
        legacy: {
          count: legacyHistory.length,
          latest: legacyHistory[0],
          all: legacyHistory
        },
        universal: {
          count: universalReports.length,
          latest: universalReports[0],
          all: universalReports
        },
        comparison: {
          avgDurationLegacy: legacyHistory.reduce((sum, history) => {
            const duration = history.completedAt && history.startedAt
              ? (new Date(history.completedAt).getTime() - new Date(history.startedAt).getTime()) / 1000
              : 0
            return sum + duration
          }, 0) / (legacyHistory.length || 1),

          avgDurationUniversal: universalReports.reduce(
            (sum, report) => sum + (report.duration || 0),
            0
          ) / (universalReports.length || 1)
        }
      }
    })
  } catch (error: unknown) {
    res.status(500).json({ success: false, message: errorMessage(error) })
  }
}
