// ════════════════════════════════════════════════════════════
// 📁 src/routes/acRenewalData.routes.ts
// Dados de renovação da ActiveCampaign (Data compra / 1ª compra /
// expiração) — só leitura na AC, endpoints manuais do Backoffice.
//
// A sync pode demorar vários minutos (1 pedido AC por aluno ativo,
// rate-limited a 5 req/s) — corre em BACKGROUND, não bloqueia o
// pedido HTTP (senão o proxy da Railway corta a ligação por timeout
// antes de terminar, e o browser reporta isso como erro de CORS).
// Progresso visível via GET /status (syncInProgress + contagens que
// vão sendo escritas na BD à medida que cada aluno é processado).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import ACRenewalData from '../models/ACRenewalData'
import { syncActiveStudentAcRenewalData, type AcRenewalDataSyncReport } from '../services/renewal/acRenewalDataSync.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

let syncInProgress = false
let syncStartedAt: Date | null = null
let lastReport: AcRenewalDataSyncReport | null = null
let lastError: string | null = null

/**
 * GET /api/renewal-ac-data/status
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, withContact, lastSynced] = await Promise.all([
    ACRenewalData.countDocuments({}),
    ACRenewalData.countDocuments({ contactId: { $ne: null } }),
    ACRenewalData.findOne({}).sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean().exec()
  ])

  // sem isto, alguma camada (proxy/CDN/browser) pode servir uma resposta
  // antiga enquanto o front sonda syncInProgress — parece "preso" mesmo
  // com a sync a avançar (confirmado: BD avança, HTTP não refletia).
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: {
      total,
      withContact,
      withoutContact: total - withContact,
      lastSyncedAt: lastSynced?.lastSyncedAt || null,
      syncInProgress,
      syncStartedAt,
      lastReport,
      lastError
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
 * Dispara a sync e responde de imediato — não espera terminar.
 */
router.post('/sync', asyncRoute(async (req: Request, res: Response) => {
  if (syncInProgress) {
    res.status(409).json({ success: false, message: 'Já há uma sincronização em curso.' })
    return
  }

  const emails: string[] | undefined = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((e: unknown) => typeof e === 'string' && e.trim())
    : undefined

  syncInProgress = true
  syncStartedAt = new Date()
  lastReport = null
  lastError = null

  syncActiveStudentAcRenewalData(emails)
    .then((report) => { lastReport = report })
    .catch((err: any) => {
      lastError = err?.message || 'Erro desconhecido na sync'
      console.error('❌ [AcRenewalDataSync] Erro em background:', err)
    })
    .finally(() => { syncInProgress = false })

  res.json({
    success: true,
    data: { started: true, message: 'Sincronização iniciada em background — consulta GET /status para acompanhar.' }
  })
}))

export default router
