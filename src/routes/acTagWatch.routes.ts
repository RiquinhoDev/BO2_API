// ════════════════════════════════════════════════════════════
// 📁 src/routes/acTagWatch.routes.ts
// A fila e o histórico da vigilância de tags.
//
// Nada aqui escreve na ActiveCampaign. A única escrita é marcar uma
// linha como aceite na nossa BD — e aceitar NÃO apaga a linha: tira-a
// da fila e mantém o histórico.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import AcTagEvent from '../models/renewal/AcTagEvent'
import CronJobConfig from '../models/SyncModels/CronJobConfig'
import { correrAcTagWatch } from '../services/renewal/acTagWatch.service'
import { boundedQueryLimit } from '../utils/queryBounds'
import { requireRenewalMutationEnabled, requireRenewalPreviewOrMutation } from './renewalParityRouteGuards'
import { HttpError } from '../security/errorHandling'
import { runMainParityExecution } from '../services/renewal/mainParityExecution'
import { getMainParityExecutionStatus } from '../services/renewal/mainParityExecutionStatus'

const router = Router()


function actor(req: Request): string {
  return req.user?.email || 'authenticated-backoffice'
}

/**
 * GET /api/ac-tag-watch/status
 * Estado do cron e contagens por severidade, só do que está por rever.
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [porSeveridade, porEstado, cronJob, ultimo, execution] = await Promise.all([
    AcTagEvent.aggregate([
      { $match: { estado: 'aberto' } },
      { $group: { _id: '$severidade', n: { $sum: 1 } } }
    ]),
    AcTagEvent.aggregate([{ $group: { _id: '$estado', n: { $sum: 1 } } }]),
    CronJobConfig.findOne({ name: 'AcTagWatch' })
      .select('schedule.enabled schedule.cronExpression isActive lastRun nextRun totalRuns failedRuns')
      .lean()
      .exec(),
    AcTagEvent.findOne({}).sort({ detectadoEm: -1 }).select('detectadoEm baseEspelhoEm').lean().exec(),
    getMainParityExecutionStatus('ac-tag-watch-run'),
  ])

  const conta = (linhas: Array<{ _id: unknown; n: number }>) =>
    Object.fromEntries(linhas.map((linha) => [String(linha._id), linha.n]))

  res.json({
    success: true,
    data: {
      fila: conta(porSeveridade),
      total: conta(porEstado),
      ultimaDeteccao: ultimo?.detectadoEm ?? null,
      espelhoBaseEm: ultimo?.baseEspelhoEm ?? null,
      cronJob: cronJob || null,
      execution,
    }
  })
}))

/**
 * GET /api/ac-tag-watch/eventos
 *
 * Sem `email`: a FILA — só o que está aberto, mais grave primeiro, e um
 * lote conta como UMA entrada com `loteTamanho`.
 * Com `email`: o HISTÓRICO desse aluno, aberto e aceite, sem agrupar.
 */
router.get('/eventos', asyncRoute(async (req: Request, res: Response) => {
  const { severidade, email, lote, estado } = req.query
  const limit = boundedQueryLimit(req.query.limit, 100)

  // Histórico de um aluno: tudo, por ordem cronológica inversa.
  if (email) {
    const eventos = await AcTagEvent.find({ email: String(email).toLowerCase().trim() })
      .sort({ quando: -1, _id: -1 })
      .limit(limit)
      .lean()
      .exec()
    return res.json({ success: true, data: { modo: 'historico', total: eventos.length, eventos } })
  }

  // As linhas de um lote, para expandir.
  if (lote) {
    const eventos = await AcTagEvent.find({ lote: String(lote) })
      .sort({ email: 1, _id: 1 })
      .limit(limit)
      .lean()
      .exec()
    return res.json({ success: true, data: { modo: 'lote', total: eventos.length, eventos } })
  }

  const query: Record<string, unknown> = { estado: estado ? String(estado) : 'aberto' }
  if (severidade) query.severidade = String(severidade)

  // Um lote dá uma entrada, não N. As N linhas continuam lá e vêm por `?lote=`.
  const ordem: Record<string, number> = { grave: 0, aviso: 1, ruido: 2 }
  // Janela finita aplicada antes do agrupamento. 200 ocultava grupos quando
  // um lote grande ocupava todos os candidatos recentes.
  const todos = await AcTagEvent.find(query).sort({ quando: -1, _id: -1 }).limit(2000).lean().exec()

  const vistos = new Set<string>()
  const fila: typeof todos = []
  for (const e of todos) {
    if (e.lote) {
      if (vistos.has(e.lote)) continue
      vistos.add(e.lote)
    }
    fila.push(e)
    if (fila.length >= limit) break
  }
  fila.sort((a, b) =>
    (ordem[a.severidade] - ordem[b.severidade])
    || (new Date(b.quando).getTime() - new Date(a.quando).getTime())
    || String(b._id).localeCompare(String(a._id)))

  res.json({ success: true, data: { modo: 'fila', total: fila.length, eventos: fila } })
}))

/**
 * POST /api/ac-tag-watch/eventos/:id/aceitar   { por, motivo }
 * POST /api/ac-tag-watch/lotes/:lote/aceitar   { por, motivo }
 *
 * Aceitar tira da fila e **mantém a linha**. É a lição da semana: uma
 * lista que não se pode limpar deixa de ser lida.
 *
 * Aceitar um lote de 168 à mão, linha a linha, é o mesmo que não o
 * aceitar — daí a segunda rota.
 */
router.post('/eventos/:id/aceitar', requireRenewalMutationEnabled, asyncRoute(async (req: Request, res: Response) => {
  const r = await runMainParityExecution({
    job: 'ac-tag-event-accept', payload: { id: req.params.id, motivo: req.body?.motivo ?? null }, effect: 'local', req, res,
    run: () => AcTagEvent.updateOne(
      { _id: req.params.id, estado: 'aberto' },
      { $set: { estado: 'aceite', aceitePor: actor(req), aceiteEm: new Date(), aceiteMotivo: req.body?.motivo ?? null } },
    ).exec(),
  })
  if (!r.matchedCount) {
    return res.status(404).json({ success: false, error: 'evento não encontrado ou já aceite' })
  }
  res.json({ success: true, data: { aceites: r.modifiedCount } })
}))

router.post('/lotes/:lote/aceitar', requireRenewalMutationEnabled, asyncRoute(async (req: Request, res: Response) => {
  const candidates = await AcTagEvent.find({ lote: req.params.lote, estado: 'aberto' })
    .sort({ _id: 1 }).select('_id').limit(201).lean().exec()
  if (candidates.length > 200) {
    throw new HttpError({ status: 409, code: 'AC_TAG_BATCH_TOO_LARGE', publicMessage: 'Lote excede o máximo de 200 eventos' })
  }
  const candidateIds = candidates.map((candidate) => candidate._id)
  const r = await runMainParityExecution({
    job: 'ac-tag-batch-accept', payload: { lote: req.params.lote, candidateIds, motivo: req.body?.motivo ?? null }, effect: 'local', req, res,
    run: () => AcTagEvent.updateMany(
      { _id: { $in: candidateIds }, lote: req.params.lote, estado: 'aberto' },
      { $set: { estado: 'aceite', aceitePor: actor(req), aceiteEm: new Date(), aceiteMotivo: req.body?.motivo ?? null } },
    ).exec(),
  })
  res.json({ success: true, data: { aceites: r.modifiedCount } })
}))

/**
 * POST /api/ac-tag-watch/correr
 *
 * Corrida manual. **`dryRun` por omissão**: só grava com
 * `{ "dryRun": false }` explícito no corpo.
 */
router.post('/correr', requireRenewalPreviewOrMutation, asyncRoute(async (req: Request, res: Response) => {
  const input = {
    dryRun: req.body?.dryRun !== false,
    actualizarEspelho: req.body?.actualizarEspelho === true,
    limiarLote: req.body?.limiarLote,
  }
  const report = await runMainParityExecution({
    job: 'ac-tag-watch-run', payload: input, effect: 'provider-and-local', dryRun: input.dryRun, req, res,
    run: () => correrAcTagWatch(input),
  })
  res.json({ success: true, data: report })
}))

export default router
