// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/studentsController.ts
// Controller para endpoints relacionados com estudantes
// ══════════════════════════════════════════════════════════════════════

import logger from '../utils/logger'
import type { NextFunction, Request, Response } from 'express'
import { successResponse } from '../contracts/responseContract'
import StudentCompleteService from '../services/studentCompleteService'
import { StudentNotFoundError, StudentDataFetchError } from '../types/studentComplete'
import { forwardApplicationError } from '../security/forwardApplicationError'

// ═══════════════════════════════════════════════════════════════
// GET /api/students/:userId/complete
// Buscar dados completos de um estudante
// ═══════════════════════════════════════════════════════════════

export async function getStudentComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params

    // Validar userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'userId é obrigatório e deve ser uma string válida',
      })
    }

    // Validar formato MongoDB ObjectId (24 caracteres hexadecimais)
    if (!/^[0-9a-fA-F]{24}$/.test(userId)) {
      return res.status(400).json({
        success: false,
        message: 'userId deve ser um ObjectId válido',
      })
    }

    logger.info(`[StudentsController] GET /api/students/${userId}/complete`)

    // Buscar dados usando service
    const response = await StudentCompleteService.getCompleteStudentData(userId)

    // Log de sucesso
    logger.info(
      `[StudentsController] Dados retornados com sucesso em ${response.meta.executionTime}ms`,
    )

    // Retornar resposta
    return res.status(200).json(successResponse(response.data, response.meta))
  } catch (error) {
    // Tratar erros conhecidos
    if (error instanceof StudentNotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    if (error instanceof StudentDataFetchError) {
      return forwardApplicationError(
        next,
        error.originalError ?? error,
        error.message,
        'STUDENT_COMPLETE_DATA_FETCH_FAILED',
      )
    }

    // Erro genérico
    return forwardApplicationError(
      next,
      error,
      'Erro interno ao buscar dados do estudante',
      'STUDENT_COMPLETE_READ_FAILED',
    )
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export default {
  getStudentComplete,
}
