import type { Request, Response } from 'express'
import type { FilterQuery } from 'mongoose'
import GuruWebhook, { type IGuruWebhook } from '../models/GuruWebhook'
import logger from '../utils/logger'
import { paginate } from '../utils/pagination'

const GURU_WEBHOOK_PUBLIC_PROJECTION =
  '_id email event status processed receivedAt'

export const listGuruWebhooks = async (req: Request, res: Response) => {
  try {
    const {
      email,
      processed,
      status,
      event,
      source,
      year,
      month,
    } = req.query
    const pagination = paginate(req.query)
    const query: FilterQuery<IGuruWebhook> = {}

    if (email) {
      query.email = (email as string).toLowerCase().trim()
    }
    if (processed !== undefined) {
      query.processed = processed === 'true'
    }
    if (status) {
      query.status = status
    }
    if (event) {
      query.event = event
    }
    if (source) {
      query.source = source
    }

    if (year && month) {
      const startDate = new Date(Number(year), Number(month) - 1, 1)
      const endDate = new Date(
        Number(year),
        Number(month),
        0,
        23,
        59,
        59,
        999,
      )
      query.receivedAt = { $gte: startDate, $lte: endDate }
    } else if (year) {
      const startDate = new Date(Number(year), 0, 1)
      const endDate = new Date(Number(year), 11, 31, 23, 59, 59, 999)
      query.receivedAt = { $gte: startDate, $lte: endDate }
    }

    const [webhooks, total] = await Promise.all([
      GuruWebhook.find(query)
        .select(GURU_WEBHOOK_PUBLIC_PROJECTION)
        .sort({ receivedAt: -1, _id: -1 })
        .skip(pagination.skip)
        .limit(pagination.limit)
        .lean(),
      GuruWebhook.countDocuments(query),
    ])

    return res.json({
      success: true,
      webhooks,
      pagination: pagination.metadata(total),
    })
  } catch (error: any) {
    logger.error('[GURU] Erro ao listar webhooks', { error })
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}
