// ════════════════════════════════════════════════════════════
// 📁 src/routes/discordRenewal.routes.ts
// Gestão dos cargos de renovação Discord + mensagens do bot.
// Ver RENOVACAO_DISCORD_CARGOS_PLAN.md.
//
// Endpoints manuais do Backoffice. A execução contra o Discord exige
// os switches DISCORD_* ligados (verificados em runtime no serviço).
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import { DiscordMessageLog, DiscordMessageTemplate, DiscordRoleChange } from '../models/discordRenewal'
import CronJobConfig from '../models/SyncModels/CronJobConfig'
import {
  approveRoleChanges,
  ensureDefaultTemplates,
  executeDiscordRolesPlan,
  generateDiscordRolesPlan,
  getDiscordRenewalStatus,
  renderMessage,
  sendDiscordMessage
} from '../services/renewal/discordRolesSync.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

function actor(req: Request): string {
  return (req as any).user?.email || (req.body && req.body.actor) || 'backoffice'
}

/** GET /api/discord-renewal/status */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const status = await getDiscordRenewalStatus()
  const cronJob = await CronJobConfig.findOne({ name: 'DiscordRolesSync' })
    .select('schedule.enabled schedule.cronExpression isActive lastRun nextRun')
    .lean()
    .exec()
  res.json({ success: true, data: { ...status, cronJob: cronJob || null } })
}))

/** GET /api/discord-renewal/changes?status=&batchId=&search=&limit=&skip=
 *  search: parcial e case-insensitive sobre email OU discordUserId.
 *  Devolve total (contagem completa do filtro) para paginação. */
router.get('/changes', asyncRoute(async (req: Request, res: Response) => {
  const { status, batchId, search } = req.query
  const limit = Math.min(Number(req.query.limit) || 50, 500)
  const skip = Math.max(Number(req.query.skip) || 0, 0)

  const query: any = {}
  if (status) query.status = status
  if (batchId) query.planBatchId = batchId
  if (search && String(search).trim()) {
    const escaped = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.$or = [
      { email: { $regex: escaped, $options: 'i' } },
      { discordUserId: { $regex: escaped } }
    ]
  }

  const [total, changes] = await Promise.all([
    DiscordRoleChange.countDocuments(query),
    DiscordRoleChange.find(query).sort({ plannedAt: -1 }).skip(skip).limit(limit).lean().exec()
  ])

  res.json({ success: true, data: { total, skip, limit, changes } })
}))

/** POST /api/discord-renewal/plan — reconciliação (dry-run, só BD) */
router.post('/plan', asyncRoute(async (_req: Request, res: Response) => {
  const report = await generateDiscordRolesPlan()
  res.json({ success: !report.anomalyAborted, data: report })
}))

/** POST /api/discord-renewal/approve  { ids: string[] } */
router.post('/approve', asyncRoute(async (req: Request, res: Response) => {
  const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : []
  if (ids.length === 0) {
    res.status(400).json({ success: false, message: 'ids obrigatório (array)' })
    return
  }
  const approved = await approveRoleChanges(ids, actor(req))
  res.json({ success: true, data: { approved } })
}))

/** POST /api/discord-renewal/execute  { batchId?, includePlanned?, limit? } — limit é clampado ao cap do env */
router.post('/execute', asyncRoute(async (req: Request, res: Response) => {
  const report = await executeDiscordRolesPlan({
    includePlanned: req.body?.includePlanned === true,
    batchId: req.body?.batchId || undefined,
    limit: req.body?.limit ? Number(req.body.limit) : undefined,
    executedBy: actor(req)
  })
  res.json({ success: report.masterEnabled, data: report })
}))

// ─────────────────────────────────────────────────────────────
// MENSAGENS
// ─────────────────────────────────────────────────────────────

/** GET /api/discord-renewal/templates (semeia os defaults na 1ª chamada) */
router.get('/templates', asyncRoute(async (_req: Request, res: Response) => {
  await ensureDefaultTemplates()
  const templates = await DiscordMessageTemplate.find({}).sort({ key: 1 }).lean().exec()
  res.json({ success: true, data: { templates } })
}))

/** PUT /api/discord-renewal/templates/:key  { name?, content } */
router.put('/templates/:key', asyncRoute(async (req: Request, res: Response) => {
  const { content, name } = req.body || {}
  if (!content || !String(content).trim()) {
    res.status(400).json({ success: false, message: 'content obrigatório' })
    return
  }
  const updated = await DiscordMessageTemplate.findOneAndUpdate(
    { key: String(req.params.key) },
    { $set: { content, ...(name ? { name } : {}), updatedBy: actor(req) } },
    { new: true }
  ).lean().exec()
  if (!updated) {
    res.status(404).json({ success: false, message: 'template não encontrado' })
    return
  }
  res.json({ success: true, data: { template: updated } })
}))

/** POST /api/discord-renewal/messages/preview  { content, mentionRoleIds, dataFim?, mentionEveryone? } */
router.post('/messages/preview', asyncRoute(async (req: Request, res: Response) => {
  const { content, dataFim } = req.body || {}
  const mentionRoleIds: string[] = Array.isArray(req.body?.mentionRoleIds) ? req.body.mentionRoleIds : []
  const rendered = renderMessage(String(content || ''), mentionRoleIds, dataFim, req.body?.mentionEveryone === true)
  res.json({ success: true, data: { rendered, length: rendered.length, parts: Math.max(1, Math.ceil(rendered.length / 1990)) } })
}))

/** POST /api/discord-renewal/messages/send  { content, mentionRoleIds, dataFim?, channelId?, templateKey?, mentionEveryone? } */
router.post('/messages/send', asyncRoute(async (req: Request, res: Response) => {
  const mentionRoleIds: string[] = Array.isArray(req.body?.mentionRoleIds) ? req.body.mentionRoleIds : []
  const result = await sendDiscordMessage({
    content: String(req.body?.content || ''),
    mentionRoleIds,
    dataFim: req.body?.dataFim,
    channelId: req.body?.channelId,
    templateKey: req.body?.templateKey,
    mentionEveryone: req.body?.mentionEveryone === true,
    sentBy: actor(req)
  })
  res.status(result.success ? 200 : 400).json(result)
}))

/** GET /api/discord-renewal/messages/logs?limit= */
router.get('/messages/logs', asyncRoute(async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100)
  const logs = await DiscordMessageLog.find({}).sort({ sentAt: -1 }).limit(limit).lean().exec()
  res.json({ success: true, data: { logs } })
}))

// ─────────────────────────────────────────────────────────────
// MENSAGENS AGENDADAS (secção 12 do plano Discord)
// ─────────────────────────────────────────────────────────────

/** GET /api/discord-renewal/scheduled — regras + alvo corrente + switch */
router.get('/scheduled', asyncRoute(async (_req: Request, res: Response) => {
  const { getScheduledStatus } = await import('../services/renewal/discordScheduledMessages.service')
  const cronJob = await CronJobConfig.findOne({ name: 'DiscordScheduledMessages' })
    .select('schedule.enabled schedule.cronExpression isActive lastRun nextRun')
    .lean()
    .exec()
  const status = await getScheduledStatus()
  res.json({ success: true, data: { ...status, cronJob: cronJob || null } })
}))

/** PATCH /api/discord-renewal/scheduled/:key  { enabled } — liga/desliga uma regra */
router.patch('/scheduled/:key', asyncRoute(async (req: Request, res: Response) => {
  const { setScheduledRuleEnabled } = await import('../services/renewal/discordScheduledMessages.service')
  const rule = await setScheduledRuleEnabled(String(req.params.key), req.body?.enabled === true)
  if (!rule) return res.status(404).json({ success: false, message: 'Regra não encontrada' })
  res.json({ success: true, data: { rule } })
}))

/** GET /api/discord-renewal/scheduled/:key/preview — texto como sairia hoje (não envia) */
router.get('/scheduled/:key/preview', asyncRoute(async (req: Request, res: Response) => {
  const { previewScheduledRule } = await import('../services/renewal/discordScheduledMessages.service')
  const result = await previewScheduledRule(String(req.params.key))
  res.status(result.success ? 200 : 404).json(result)
}))

/** POST /api/discord-renewal/scheduled/:key/test — envia SEM menções (ninguém notificado) */
router.post('/scheduled/:key/test', asyncRoute(async (req: Request, res: Response) => {
  const { testScheduledRule } = await import('../services/renewal/discordScheduledMessages.service')
  const result = await testScheduledRule(String(req.params.key), actor(req))
  res.status(result.success ? 200 : 400).json(result)
}))

/** POST /api/discord-renewal/scheduled/run — corre o job já (respeita switches/idempotência) */
router.post('/scheduled/run', asyncRoute(async (_req: Request, res: Response) => {
  const { runScheduledMessagesJob } = await import('../services/renewal/discordScheduledMessages.service')
  const report = await runScheduledMessagesJob()
  res.json({ success: true, data: report })
}))

export default router
