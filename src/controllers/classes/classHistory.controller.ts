import type { Request, RequestHandler } from 'express'
import { HttpError } from '../../security/errorHandling'
import type { ClassHistoryService } from '../../services/classes/classHistory.service'

type Service = Pick<ClassHistoryService, 'listHistory' | 'byDiscord' | 'byEmail' | 'completeHistory'>

const num = (value: unknown, fallback: number): number => Number(value ?? fallback)

export function createGetClassHistoryController(service: Service): RequestHandler {
  return async (req, res, next) => {
    try {
      const { classId, studentId, dateFrom, dateTo, limit, offset } = req.query
      const result = await service.listHistory({
        classId: classId as string,
        studentId: studentId as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        limit: num(limit, 50),
        offset: num(offset, 0),
      })
      res.json({ success: true, ...result })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_HISTORY_FAILED', publicMessage: 'Erro ao buscar histórico.', cause: error }))
    }
  }
}

export function createStudentHistoryByDiscordController(service: Service): RequestHandler<{ discordId: string }> {
  return async (req, res, next) => {
    try {
      const result = await service.byDiscord(req.params.discordId, num(req.query.limit, 50), num(req.query.offset, 0))
      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Usuário não encontrado com esse Discord ID' })
        return
      }
      res.json({ success: true, student: result.student, history: result.history, total: result.total, timestamp: result.timestamp })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'STUDENT_HISTORY_BY_DISCORD_FAILED', publicMessage: 'Erro ao buscar histórico do estudante.', cause: error }))
    }
  }
}

export function createStudentHistoryByEmailController(service: Service): RequestHandler<{ email: string }> {
  return async (req, res, next) => {
    try {
      const result = await service.byEmail(req.params.email, num(req.query.limit, 50), num(req.query.offset, 0))
      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Usuário não encontrado com esse email' })
        return
      }
      res.json({ success: true, student: result.student, history: result.history, total: result.total, timestamp: result.timestamp })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'STUDENT_HISTORY_BY_EMAIL_FAILED', publicMessage: 'Erro ao buscar histórico do estudante.', cause: error }))
    }
  }
}

export function createGetClassCompleteHistoryController(service: Service): RequestHandler<{ classId: string }> {
  return async (req: Request<{ classId: string }>, res, next) => {
    try {
      const { classId } = req.params
      const { type } = req.query
      const limit = num(req.query.limit, 50)
      const offset = num(req.query.offset, 0)

      const result = await service.completeHistory(classId, { limit, offset, type: type as string | undefined })

      if (result.kind === 'bad_request') {
        res.status(400).json({ success: false, message: 'classId é obrigatório' })
        return
      }
      if (result.kind === 'not_found') {
        res.status(404).json({ success: false, message: 'Turma não encontrada' })
        return
      }

      res.json({
        success: true,
        classId,
        className: result.className,
        history: result.history,
        total: result.total,
        pagination: {
          limit: result.limit,
          offset: result.offset,
          hasMore: result.offset + result.limit < result.total,
        },
        timestamp: result.timestamp,
      })
    } catch (error) {
      next(new HttpError({ status: 500, code: 'CLASS_COMPLETE_HISTORY_FAILED', publicMessage: 'Erro ao buscar histórico da turma.', cause: error }))
    }
  }
}
