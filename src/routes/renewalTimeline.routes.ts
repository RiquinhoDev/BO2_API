// ════════════════════════════════════════════════════════════
// 📁 src/routes/renewalTimeline.routes.ts
// Timeline de renovação por aluno. Lê `studentrenewaltimelines`
// e dispara a geração.
//
// A geração de UM aluno é síncrona e só lê/escreve a nossa BD.
// A de todos corre sob receipt durável e devolve o relatório final
// do proxy da Railway.
// ════════════════════════════════════════════════════════════

import { Router, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import { asyncRoute } from '../security/asyncRoute'
import StudentRenewalTimeline from '../models/StudentRenewalTimeline'
import {
  gerarTimelinesEmLote,
  gerarTimelineDeAluno,
} from '../services/renewal/renewalTimeline.service'
import { normalizeMainParityEmails, runMainParityExecution } from '../services/renewal/mainParityExecution'
import { getMainParityExecutionStatus } from '../services/renewal/mainParityExecutionStatus'
import { boundedQueryLimit } from '../utils/queryBounds'
import { requireRenewalMutationEnabled } from './renewalParityRouteGuards'
import { HttpError } from '../security/errorHandling'

const router = Router()


router.get('/status', asyncRoute(async (_req: Request, res: Response) => {
  const [total, comDesvio, ultima, execution] = await Promise.all([
    StudentRenewalTimeline.countDocuments({}),
    StudentRenewalTimeline.countDocuments({ 'cadeia.tagIgualTurma': 'divergente' }),
    StudentRenewalTimeline.findOne({}).sort({ geradoEm: -1 }).select('geradoEm').lean().exec(),
    getMainParityExecutionStatus('renewal-timeline-bulk'),
  ])

  res.set('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.json({
    success: true,
    data: {
      total,
      comDesvio,
      geradoEm: ultima?.geradoEm ?? null,
      execution,
    }
  })
}))

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
  const entries = await StudentRenewalTimeline.find(query).sort({ _id: 1 }).limit(limit).lean().exec()
  res.json({ success: true, data: { total: entries.length, entries } })
}))

router.post('/generate', requireRenewalMutationEnabled, asyncRoute(async (req: Request, res: Response) => {
  const suppliedUserId = req.body?.userId
  if (suppliedUserId !== undefined && (typeof suppliedUserId !== 'string' || !mongoose.isValidObjectId(suppliedUserId))) {
    throw new HttpError({ status: 400, code: 'INVALID_USER_ID', publicMessage: 'userId inválido' })
  }
  const userId = typeof suppliedUserId === 'string' ? suppliedUserId : null

  if (userId) {
    const timeline = await runMainParityExecution({
      job: 'renewal-timeline-user', payload: { userId }, effect: 'local', req, res,
      run: () => gerarTimelineDeAluno(userId),
    })
    if (!timeline) {
      res.status(404).json({ success: false, message: 'Aluno não encontrado.' })
      return
    }
    res.json({ success: true, data: { timeline } })
    return
  }

  const emails = normalizeMainParityEmails(req.body?.emails)
  const report = await runMainParityExecution({
    job: 'renewal-timeline-bulk', payload: { emails }, effect: 'local', req, res,
    run: () => gerarTimelinesEmLote(emails),
  })
  res.json({ success: true, data: { report } })
}))

export default router
