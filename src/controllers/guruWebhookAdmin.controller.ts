import type { NextFunction, Request, Response } from 'express'
import GuruWebhook from '../models/GuruWebhook'
import { guruTokenDebugStatus } from '../security/debugRoutes'
import { internalError } from '../security/errorHandling'
import { getGuruAccountToken } from '../services/requestDrivenRuntimeConfig'

export const debugToken = async (req: Request, res: Response) => {
  return res.json(guruTokenDebugStatus(getGuruAccountToken()))
}

export const migrateWebhookSource = async (req: Request, res: Response, next: NextFunction) => {
  try {
    console.log('🔄 [GURU] Iniciando migração de webhooks antigos...')

    // Buscar todos os webhooks que não têm o campo 'source' definido
    // ou que têm source como null/undefined
    const webhooksToMigrate = await GuruWebhook.find({
      $or: [
        { source: { $exists: false } },
        { source: null }
      ]
    })

    console.log(`   📊 Webhooks encontrados para migração: ${webhooksToMigrate.length}`)

    if (webhooksToMigrate.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhum webhook precisa de migração',
        migrated: 0
      })
    }

    // Atualizar todos para source: 'manual'
    const result = await GuruWebhook.updateMany(
      {
        $or: [
          { source: { $exists: false } },
          { source: null }
        ]
      },
      {
        $set: { source: 'manual' }
      }
    )

    console.log(`   ✅ Webhooks migrados: ${result.modifiedCount}`)

    return res.json({
      success: true,
      message: `${result.modifiedCount} webhooks migrados para source: 'manual'`,
      migrated: result.modifiedCount,
      matched: result.matchedCount
    })

  } catch (error: unknown) {
    return next(internalError('Erro ao migrar webhooks Guru', 'GURU_WEBHOOK_MIGRATION_FAILED', error))
  }
}
