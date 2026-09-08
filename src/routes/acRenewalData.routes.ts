// ════════════════════════════════════════════════════════════
// 📁 src/routes/acRenewalData.routes.ts
// Dados de renovação da ActiveCampaign (Data compra / 1ª compra /
// expiração) — só leitura na AC, endpoints manuais do Backoffice.
//
// A sync pode demorar vários minutos (1 pedido AC por aluno ativo,
// rate-limited a 5 req/s) — corre com receipt durável e devolve o resultado ao
// pedido HTTP (senão o proxy da Railway corta a ligação por timeout
// antes de terminar, e o browser reporta isso como erro de CORS).
// Progresso visível via GET /status (syncInProgress + contagens que
// vão sendo escritas na BD à medida que cada aluno é processado).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { asyncRoute } from '../security/asyncRoute'
import ACRenewalData from '../models/ACRenewalData'
import { syncActiveStudentAcRenewalData } from '../services/renewal/acRenewalDataSync.service'
import { normalizeMainParityEmails, runMainParityExecution } from '../services/renewal/mainParityExecution'
import { getMainParityExecutionStatus } from '../services/renewal/mainParityExecutionStatus'
import { boundedQueryLimit } from '../utils/queryBounds'
import { requireRenewalMutationEnabled } from './renewalParityRouteGuards'
import { HttpError } from '../security/errorHandling'

const router = Router()


/**
 * GET /api/renewal-ac-data/status
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, withContact, lastSynced, execution] = await Promise.all([
    ACRenewalData.countDocuments({}),
    ACRenewalData.countDocuments({ contactId: { $ne: null } }),
    ACRenewalData.findOne({}).sort({ lastSyncedAt: -1 }).select('lastSyncedAt').lean().exec(),
    getMainParityExecutionStatus('ac-renewal-data-sync'),
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
      execution,
    }
  })
}))

/**
 * GET /api/renewal-ac-data?userId=... ou ?email=...
 */
router.get('/', asyncRoute(async (req: Request, res: Response) => {
  const { userId, email } = req.query
  const query: Record<string, unknown> = {}
  if (userId !== undefined) {
    if (typeof userId !== 'string' || !mongoose.isValidObjectId(userId)) throw new HttpError({ status: 400, code: 'INVALID_USER_ID', publicMessage: 'userId inválido' })
    query.userId = userId
  }
  if (email !== undefined) {
    if (typeof email !== 'string') throw new HttpError({ status: 400, code: 'INVALID_EMAIL', publicMessage: 'email inválido' })
    query.email = email.toLowerCase().trim()
  }

  const limit = boundedQueryLimit(req.query.limit, 100)
  const data = await ACRenewalData.find(query).sort({ _id: 1 }).limit(limit).lean().exec()
  res.json({ success: true, data: { total: data.length, entries: data } })
}))

/**
 * POST /api/renewal-ac-data/sync  { emails?: string[] }
 * Executa sob receipt durável e devolve o relatório final.
 */
router.post('/sync', requireRenewalMutationEnabled, asyncRoute(async (req: Request, res: Response) => {
  const emails = normalizeMainParityEmails(req.body?.emails)
  const report = await runMainParityExecution({
    job: 'ac-renewal-data-sync', payload: { emails }, effect: 'provider-and-local', req, res,
    run: () => syncActiveStudentAcRenewalData(emails),
  })
  res.json({ success: true, data: { report } })
}))

export default router
