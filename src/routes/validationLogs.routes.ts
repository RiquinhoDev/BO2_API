// src/routes/validationLogs.routes.ts
// Endpoints de leitura dos logs de validação para o backoffice.
// Montado em /api/form → GET /api/form/logs e /api/form/logs/stats
import { Router, Request, Response } from 'express'
import ValidationLog from '../models/ValidationLog'

const router = Router()

const LOG_SELECT_FIELDS =
  'email name discordId classId className outcome errorCode httpStatus message ip userAgent finalDate createdAt -_id'

const escapeRegex = (value: unknown) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const buildCreatedAtFilter = (from?: unknown, to?: unknown, defaultDays?: number) => {
  const createdAt: Record<string, Date> = {}

  if (from) {
    const fromDate = new Date(String(from))
    if (!Number.isNaN(fromDate.getTime())) createdAt.$gte = fromDate
  } else if (defaultDays) {
    const fallbackFrom = new Date()
    fallbackFrom.setDate(fallbackFrom.getDate() - defaultDays)
    createdAt.$gte = fallbackFrom
  }

  if (to) {
    const toDate = new Date(String(to))
    if (!Number.isNaN(toDate.getTime())) {
      toDate.setHours(23, 59, 59, 999) // incluir o dia inteiro do "to"
      createdAt.$lte = toDate
    }
  }

  return Object.keys(createdAt).length ? { createdAt } : {}
}

const buildLogsQuery = (query: any, useDefaultRange = false) => {
  const filter: Record<string, unknown> = {
    ...buildCreatedAtFilter(query.from, query.to, useDefaultRange ? 30 : undefined),
  }

  if (query.outcome) filter.outcome = String(query.outcome).toUpperCase()
  if (query.errorCode) filter.errorCode = String(query.errorCode).toUpperCase()
  if (query.search) filter.email = { $regex: escapeRegex(query.search), $options: 'i' }

  return filter
}

router.get('/logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(String(req.query.page), 10) || 1, 1)
    const limit = Math.min(Math.max(parseInt(String(req.query.limit), 10) || 50, 1), 200)
    const skip = (page - 1) * limit
    const filter = buildLogsQuery(req.query)

    const [total, items] = await Promise.all([
      ValidationLog.countDocuments(filter),
      ValidationLog.find(filter)
        .select(LOG_SELECT_FIELDS)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ])

    return res.status(200).json({ total, page, limit, items })
  } catch (error: any) {
    console.error('[VALIDATION_LOGS] Error listing logs:', error)
    return res.status(500).json({
      message: 'Erro ao listar logs de validação.',
      error: 'VALIDATION_LOGS_LIST_ERROR',
    })
  }
})

router.get('/logs/stats', async (req: Request, res: Response) => {
  try {
    const filter = buildLogsQuery(req.query, true)

    const [daily, breakdown] = await Promise.all([
      ValidationLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              outcome: '$outcome',
            },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: '$_id.date',
            total: { $sum: '$count' },
            validated: {
              $sum: { $cond: [{ $eq: ['$_id.outcome', 'VALIDATED'] }, '$count', 0] },
            },
          },
        },
        {
          $project: {
            _id: 0,
            date: '$_id',
            total: 1,
            validated: 1,
            rejected: { $subtract: ['$total', '$validated'] },
          },
        },
        { $sort: { date: 1 } },
      ]),
      ValidationLog.aggregate([
        { $match: filter },
        { $group: { _id: '$outcome', count: { $sum: 1 } } },
        { $project: { _id: 0, outcome: '$_id', count: 1 } },
        { $sort: { outcome: 1 } },
      ]),
    ])

    const totals = daily.reduce(
      (acc: any, day: any) => {
        acc.total += day.total
        acc.validated += day.validated
        acc.rejected += day.rejected
        return acc
      },
      { total: 0, validated: 0, rejected: 0, successRate: 0 }
    )

    totals.successRate =
      totals.total > 0 ? Math.round((totals.validated / totals.total) * 1000) / 10 : 0

    return res.status(200).json({ daily, breakdown, totals })
  } catch (error: any) {
    console.error('[VALIDATION_LOGS] Error loading stats:', error)
    return res.status(500).json({
      message: 'Erro ao carregar estatísticas de validação.',
      error: 'VALIDATION_LOGS_STATS_ERROR',
    })
  }
})

export default router
