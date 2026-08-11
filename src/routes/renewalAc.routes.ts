// ════════════════════════════════════════════════════════════
// 📁 src/routes/renewalAc.routes.ts
// Gestão do sync Renovação OGI → ActiveCampaign (Fase B).
// Ver docs/reference/renewal/RENOVACAO_OGI_BO_PLAN.md.
//
// Nada aqui corre sozinho: são endpoints manuais do Backoffice.
// A execução contra a AC exige os switches RENEWAL_AC_* ligados
// (verificados em runtime dentro do serviço).
// ════════════════════════════════════════════════════════════

import { asyncRoute } from '../security/asyncRoute'
import { Router, type Request, type Response } from 'express'
import RenewalAcChange from '../models/RenewalAcChange'
import CronJobConfig from '../models/SyncModels/CronJobConfig'
import {
  renewalAcExecuteInput,
  renewalAcRevertInput,
} from '../security/renewalAcDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'
import { boundedQueryLimit } from '../utils/queryBounds'
import { detectHotmartRefunds } from '../services/renewal/hotmartRefunds.service'
import { syncTurmaTags } from '../services/renewal/acTurmaTagSync.service'
import { handleRefunds } from '../services/renewal/refundHandler.service'
import {
  approveChanges,
  executePlan,
  generatePlan,
  getRenewalAcStatus,
  revertChange
} from '../services/renewal/renewalAcSync.service'

const router = Router()

function actor(req: Pick<Request, 'user'>, validatedActor?: string): string {
  return req.user?.email || validatedActor || 'backoffice'
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

  const query: any = {}
  if (status) query.status = status
  if (batchId) query.planBatchId = batchId
  if (email) query.email = String(email).toLowerCase()

  const changes = await RenewalAcChange.find(query)
    .sort({ plannedAt: -1, _id: -1 })
    .limit(boundedQueryLimit(req.query.limit, 200))
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
 * POST /api/renewal-ac/turma-tags/sync
 * Omitir dryRun (ou enviá-lo true) é sempre só relatório. A AC só é tocada
 * quando o chamador passa dryRun:false explicitamente.
 */
router.post('/turma-tags/sync', asyncRoute(async (req: Request, res: Response) => {
  const report = await syncTurmaTags({
    dryRun: req.body?.dryRun === false ? false : true,
    emails: Array.isArray(req.body?.emails) ? req.body.emails : undefined,
    manual: req.body?.manual === true
  })
  res.json({ success: true, data: report })
}))

/**
 * POST /api/renewal-ac/refunds/handle
 * Marca a nossa BD e remove tags de turma apenas quando dryRun:false.
 */
router.post('/refunds/handle', asyncRoute(async (req: Request, res: Response) => {
  const report = await handleRefunds({
    dryRun: req.body?.dryRun === false ? false : true,
    emails: Array.isArray(req.body?.emails) ? req.body.emails : undefined
  })
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
  const approved = await approveChanges(
    ids,
    actor(req, typeof req.body?.actor === 'string' ? req.body.actor : undefined)
  )
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
