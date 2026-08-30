// ════════════════════════════════════════════════════════════
// 📁 src/routes/acTagWatch.routes.ts
// A fila e o histórico da vigilância de tags.
//
// Nada aqui escreve na ActiveCampaign. A única escrita é marcar uma
// linha como aceite na nossa BD — e aceitar NÃO apaga a linha: tira-a
// da fila e mantém o histórico.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import AcTagEvent from '../models/renewal/AcTagEvent'
import CronJobConfig from '../models/SyncModels/CronJobConfig'
import { correrAcTagWatch } from '../services/renewal/acTagWatch.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next)
}

function actor(req: Request): string {
  return (req as any).user?.email || (req.body && req.body.por) || 'backoffice'
}

/**
 * GET /api/ac-tag-watch/status
 * Estado do cron e contagens por severidade, só do que está por rever.
 */
router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [porSeveridade, porEstado, cronJob, ultimo] = await Promise.all([
    AcTagEvent.aggregate([
      { $match: { estado: 'aberto' } },
      { $group: { _id: '$severidade', n: { $sum: 1 } } }
    ]),
    AcTagEvent.aggregate([{ $group: { _id: '$estado', n: { $sum: 1 } } }]),
    CronJobConfig.findOne({ name: 'AcTagWatch' })
      .select('schedule.enabled schedule.cronExpression isActive lastRun nextRun totalRuns failedRuns')
      .lean()
      .exec(),
    AcTagEvent.findOne({}).sort({ detectadoEm: -1 }).select('detectadoEm baseEspelhoEm').lean().exec()
  ])

  const conta = (linhas: any[]) =>
    Object.fromEntries(linhas.map((l: any) => [String(l._id), l.n]))

  res.json({
    success: true,
    data: {
      fila: conta(porSeveridade),
      total: conta(porEstado),
      ultimaDeteccao: (ultimo as any)?.detectadoEm ?? null,
      espelhoBaseEm: (ultimo as any)?.baseEspelhoEm ?? null,
      cronJob: cronJob || null
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
  const limit = Math.min(Number(req.query.limit) || 100, 500)

  // Histórico de um aluno: tudo, por ordem cronológica inversa.
  if (email) {
    const eventos = await AcTagEvent.find({ email: String(email).toLowerCase().trim() })
      .sort({ quando: -1 })
      .limit(limit)
      .lean()
      .exec()
    return res.json({ success: true, data: { modo: 'historico', total: eventos.length, eventos } })
  }

  // As linhas de um lote, para expandir.
  if (lote) {
    const eventos = await AcTagEvent.find({ lote: String(lote) })
      .sort({ email: 1 })
      .limit(limit)
      .lean()
      .exec()
    return res.json({ success: true, data: { modo: 'lote', total: eventos.length, eventos } })
  }

  const query: any = { estado: estado ? String(estado) : 'aberto' }
  if (severidade) query.severidade = String(severidade)

  // Um lote dá uma entrada, não N. As N linhas continuam lá e vêm por `?lote=`.
  const ordem: Record<string, number> = { grave: 0, aviso: 1, ruido: 2 }
  const todos = await AcTagEvent.find(query).sort({ quando: -1 }).limit(2000).lean().exec()

  const vistos = new Set<string>()
  const fila: any[] = []
  for (const e of todos as any[]) {
    if (e.lote) {
      if (vistos.has(e.lote)) continue
      vistos.add(e.lote)
    }
    fila.push(e)
    if (fila.length >= limit) break
  }
  fila.sort((a, b) => (ordem[a.severidade] - ordem[b.severidade]) || (b.quando - a.quando))

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
router.post('/eventos/:id/aceitar', asyncRoute(async (req: Request, res: Response) => {
  const r = await AcTagEvent.updateOne(
    { _id: req.params.id, estado: 'aberto' },
    { $set: { estado: 'aceite', aceitePor: actor(req), aceiteEm: new Date(), aceiteMotivo: req.body?.motivo ?? null } }
  )
  if (!r.matchedCount) {
    return res.status(404).json({ success: false, error: 'evento não encontrado ou já aceite' })
  }
  res.json({ success: true, data: { aceites: r.modifiedCount } })
}))

router.post('/lotes/:lote/aceitar', asyncRoute(async (req: Request, res: Response) => {
  const r = await AcTagEvent.updateMany(
    { lote: req.params.lote, estado: 'aberto' },
    { $set: { estado: 'aceite', aceitePor: actor(req), aceiteEm: new Date(), aceiteMotivo: req.body?.motivo ?? null } }
  )
  res.json({ success: true, data: { aceites: r.modifiedCount } })
}))

/**
 * POST /api/ac-tag-watch/correr
 *
 * Corrida manual. **`dryRun` por omissão**: só grava com
 * `{ "dryRun": false }` explícito no corpo.
 */
router.post('/correr', asyncRoute(async (req: Request, res: Response) => {
  const report = await correrAcTagWatch({
    dryRun: req.body?.dryRun !== false,
    actualizarEspelho: req.body?.actualizarEspelho === true,
    limiarLote: req.body?.limiarLote
  })
  res.json({ success: true, data: report })
}))

export default router
