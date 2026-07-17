// ════════════════════════════════════════════════════════════
// 📁 src/routes/renewalAc.routes.ts
// Gestão do sync Renovação OGI → ActiveCampaign (Fase B).
// Ver RENOVACAO_OGI_BO_PLAN.md.
//
// Nada aqui corre sozinho: são endpoints manuais do Backoffice.
// A execução contra a AC exige os switches RENEWAL_AC_* ligados
// (verificados em runtime dentro do serviço).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import RenewalAcChange from '../models/RenewalAcChange'
import CronJobConfig from '../models/SyncModels/CronJobConfig'
import {
  renewalAcExecuteInput,
  renewalAcRevertInput,
} from '../security/renewalAcDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'
import { detectHotmartRefunds } from '../services/renewal/hotmartRefunds.service'
import {
  approveChanges,
  executePlan,
  generatePlan,
  getRenewalAcStatus,
  revertChange
} from '../services/renewal/renewalAcSync.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

function actor(req: { body?: unknown }, validatedActor?: string): string {
  const bodyActor = (req.body as { actor?: string } | undefined)?.actor
  return (req as any).user?.email || validatedActor || bodyActor || 'backoffice'
}

/**
 * GET /api/renewal-ac/status
 * Switches (runtime), contagens por estado, último plano e estado do cron.
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const status = await getRenewalAcStatus()
  const cronJob = await CronJobConfig.findOne({ name: 'RenewalAcSync' })
    .select('schedule.enabled schedule.cronExpression isActive lastRun nextRun')
    .lean()
    .exec()

  res.json({ success: true, data: { ...status, cronJob: cronJob || null } })
}))

/**
 * GET /api/renewal-ac/changes?status=PLANNED&batchId=...&limit=100
 */
router.get('/changes', asyncRoute(async (req: Request, res: Response) => {
  const { status, batchId, email } = req.query
  const limit = Math.min(Number(req.query.limit) || 200, 500)

  const query: any = {}
  if (status) query.status = status
  if (batchId) query.planBatchId = batchId
  if (email) query.email = String(email).toLowerCase()

  const changes = await RenewalAcChange.find(query)
    .sort({ plannedAt: -1 })
    .limit(limit)
    .lean()
    .exec()

  res.json({ success: true, data: { total: changes.length, changes } })
}))

/**
 * POST /api/renewal-ac/plan  { windowHours? }
 * Gera o plano (dry-run persistido). Escreve APENAS na nossa BD — zero AC.
 */
router.post('/plan', asyncRoute(async (req: Request, res: Response) => {
  const windowHours = Number(req.body?.windowHours) || 26
  const report = await generatePlan(windowHours)
  res.json({ success: !report.anomalyAborted, data: report })
}))

/**
 * POST /api/renewal-ac/refunds/detect  { windowDays? }
 * Detecção manual de reembolsos Hotmart. Escreve APENAS na nossa BD.
 */
router.post('/refunds/detect', asyncRoute(async (req: Request, res: Response) => {
  const windowDays = Number(req.body?.windowDays) || 30
  const report = await detectHotmartRefunds(windowDays)
  res.json({ success: true, data: report })
}))

/**
 * POST /api/renewal-ac/approve  { ids: string[] }
 */
router.post('/approve', asyncRoute(async (req: Request, res: Response) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : []
  if (ids.length === 0) {
    res.status(400).json({ success: false, message: 'ids obrigatório (array de change ids)' })
    return
  }
  const approved = await approveChanges(ids, actor(req))
  res.json({ success: true, data: { approved } })
}))

/**
 * POST /api/renewal-ac/execute  { batchId?, includePlanned? }
 * Executa contra a AC. Exige RENEWAL_AC_SYNC_ENABLED=true (runtime) —
 * caso contrário devolve o relatório com masterEnabled=false e nada escrito.
 * Por defeito executa APENAS changes APPROVED (revistas por humano).
 */
router.post('/execute', withValidatedInput(renewalAcExecuteInput, async (input, req, res) => {
  const report = await executePlan({
    includePlanned: input.body.includePlanned === true,
    batchId: input.body.batchId,
    executedBy: actor(req, input.body.actor)
  })
  res.json({ success: report.masterEnabled, data: report })
}))

/**
 * POST /api/renewal-ac/changes/:id/revert
 */
router.post('/changes/:id/revert', withValidatedInput(renewalAcRevertInput, async (input, req, res) => {
  const result = await revertChange(input.params.id, actor(req, input.body.actor))
  res.status(result.success ? 200 : 400).json({ success: result.success, message: result.message })
}))

export default router
