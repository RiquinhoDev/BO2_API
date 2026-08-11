// ════════════════════════════════════════════════════════════
// 📁 src/routes/acRenewalData.routes.ts
// Dados de renovação da ActiveCampaign (Data compra / 1ª compra /
// expiração) — só leitura na AC, endpoints manuais do Backoffice.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import ACRenewalData from '../models/ACRenewalData'
import { syncActiveStudentAcRenewalData } from '../services/renewal/acRenewalDataSync.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * GET /api/renewal-ac-data/status
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, withContact, lastSynced] = await Promise.all([
    ACRenewalData.countDocuments({}),
    ACRenewalData.countDocuments({ contactId: { $ne: null } }),
    ACRenewalData.findOne({}).sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean().exec()
  ])

  res.json({
    success: true,
    data: {
      total,
      withContact,
      withoutContact: total - withContact,
      lastSyncedAt: lastSynced?.lastSyncedAt || null
    }
  })
}))

/**
 * GET /api/renewal-ac-data?userId=... ou ?email=...
 */
router.get('/', asyncRoute(async (req: Request, res: Response) => {
  const { userId, email } = req.query
  const query: Record<string, unknown> = {}
  if (userId) query.userId = userId
  if (email) query.email = String(email).toLowerCase().trim()

  const data = await ACRenewalData.find(query).lean().exec()
  res.json({ success: true, data: { total: data.length, entries: data } })
}))

/**
 * POST /api/renewal-ac-data/sync  { emails?: string[] }
 */
router.post('/sync', asyncRoute(async (req: Request, res: Response) => {
  const emails: string[] | undefined = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((e: unknown) => typeof e === 'string' && e.trim())
    : undefined

  const report = await syncActiveStudentAcRenewalData(emails)
  res.json({ success: true, data: report })
}))

export default router
