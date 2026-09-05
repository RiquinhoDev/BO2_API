import logger from '../utils/logger'
import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import GuruWebhook from '../models/GuruWebhook'
import { MAX_BULK_OPERATION_ITEMS } from '../security/bulkOperationPolicy'
import { internalError } from '../security/errorHandling'

function sourceMigrationFilter() {
  return {
    $or: [
      { source: { $exists: false } },
      { source: null },
    ],
  }
}

export const migrateWebhookSource = async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('🔄 [GURU] Iniciando migração de webhooks antigos...')

    const candidates = await GuruWebhook.find(sourceMigrationFilter())
      .select('_id')
      .sort({ _id: 1 })
      .limit(MAX_BULK_OPERATION_ITEMS + 1)
      .lean()
    const candidateIds = candidates
      .slice(0, MAX_BULK_OPERATION_ITEMS)
      .map((webhook) => webhook._id)
    const hasMore = candidates.length > MAX_BULK_OPERATION_ITEMS

    logger.info(`   📊 Webhooks encontrados para migração: ${candidateIds.length}`)

    if (candidateIds.length === 0) {
      return res.json(successResponse({
        message: 'Nenhum webhook precisa de migração',
        migrated: 0,
        batchLimit: MAX_BULK_OPERATION_ITEMS,
        hasMore: false,
      }))
    }

    const result = await GuruWebhook.updateMany(
      {
        ...sourceMigrationFilter(),
        _id: { $in: candidateIds },
      },
      {
        $set: { source: 'manual' }
      }
    )

    logger.info(`   ✅ Webhooks migrados: ${result.modifiedCount}`)

    return res.json(successResponse({
      message: `${result.modifiedCount} webhooks migrados para source: 'manual'`,
      migrated: result.modifiedCount,
      matched: result.matchedCount,
      batchLimit: MAX_BULK_OPERATION_ITEMS,
      hasMore,
    }))

  } catch (error: unknown) {
    return next(internalError('Erro ao migrar webhooks Guru', 'GURU_WEBHOOK_MIGRATION_FAILED', error))
  }
}
