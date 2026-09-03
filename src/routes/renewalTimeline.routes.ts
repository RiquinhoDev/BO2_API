// ════════════════════════════════════════════════════════════
// 📁 src/routes/renewalTimeline.routes.ts
// Timeline de renovação por aluno. Lê `studentrenewaltimelines`
// e dispara a geração.
//
// A geração de UM aluno é síncrona e só lê/escreve a nossa BD.
// A de todos corre em background para não ficar presa ao timeout
// do proxy da Railway.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type RequestHandler, type Response } from 'express'
import StudentRenewalTimeline from '../models/StudentRenewalTimeline'
import {
  gerarTimelinesEmLote,
  gerarTimelineDeAluno,
  type TimelineSyncReport
} from '../services/renewal/renewalTimeline.service'

const router = Router()

const asyncRoute = (fn: any): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

let geracaoEmCurso = false
let geracaoIniciadaEm: Date | null = null
let ultimoRelatorio: TimelineSyncReport | null = null
let ultimoErro: string | null = null

router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, comDesvio, ultima] = await Promise.all([
    StudentRenewalTimeline.countDocuments({}),
    StudentRenewalTimeline.countDocuments({ 'cadeia.tagIgualTurma': 'divergente' }),
    StudentRenewalTimeline.findOne({}).sort({ geradoEm: -1 }).select('geradoEm').lean().exec()
  ])

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: {
      total,
      comDesvio,
      geradoEm: ultima?.geradoEm ?? null,
      geracaoEmCurso,
      geracaoIniciadaEm,
      ultimoRelatorio,
      ultimoErro
    }
  })
}))

router.get('/', asyncRoute(async (req: Request, res: Response) => {
  const { userId, email } = req.query
  const query: Record<string, unknown> = {}
  if (userId) query.userId = userId
  if (email) query.email = String(email).toLowerCase().trim()

  const entries = await StudentRenewalTimeline.find(query).lean().exec()
  res.json({ success: true, data: { total: entries.length, entries } })
}))

router.post('/generate', asyncRoute(async (req: Request, res: Response) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId : null

  if (userId) {
    const timeline = await gerarTimelineDeAluno(userId)
    if (!timeline) {
      res.status(404).json({ success: false, message: 'Aluno não encontrado.' })
      return
    }
    res.json({ success: true, data: { timeline } })
    return
  }

  if (geracaoEmCurso) {
    res.status(409).json({ success: false, message: 'Já há uma geração em curso.' })
    return
  }

  const emails: string[] | undefined = Array.isArray(req.body?.emails)
    ? req.body.emails.filter((e: unknown) => typeof e === 'string' && e.trim())
    : undefined

  geracaoEmCurso = true
  geracaoIniciadaEm = new Date()
  ultimoRelatorio = null
  ultimoErro = null

  gerarTimelinesEmLote(emails)
    .then((relatorio) => { ultimoRelatorio = relatorio })
    .catch((error: any) => {
      ultimoErro = error?.message || 'Erro desconhecido na geração'
      console.error('❌ [RenewalTimeline] Erro em background:', error)
    })
    .finally(() => { geracaoEmCurso = false })

  res.json({
    success: true,
    data: {
      started: true,
      message: 'Geração iniciada em background — consulta GET /status para acompanhar.'
    }
  })
}))

export default router
