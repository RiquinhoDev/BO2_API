// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/studentsController.ts
// Controller para endpoints relacionados com estudantes
// ══════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express'
import StudentCompleteService from '../services/studentCompleteService'
import { StudentNotFoundError, StudentDataFetchError } from '../types/studentComplete'
import { getRuntimeConfig } from '../config/runtimeConfig'

// ═══════════════════════════════════════════════════════════════
// GET /api/students/:userId/complete
// Buscar dados completos de um estudante
// ═══════════════════════════════════════════════════════════════

export async function getStudentComplete(req: Request, res: Response) {
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

    console.log(`[StudentsController] GET /api/students/${userId}/complete`)

    // Buscar dados usando service
    const response = await StudentCompleteService.getCompleteStudentData(userId)

    // Log de sucesso
    console.log(
      `[StudentsController] Dados retornados com sucesso em ${response.meta.executionTime}ms`,
    )

    // Retornar resposta
    return res.status(200).json(response)
  } catch (error) {
    console.error('[StudentsController] Erro:', error)

    // Tratar erros conhecidos
    if (error instanceof StudentNotFoundError) {
      return res.status(404).json({
        success: false,
        message: error.message,
      })
    }

    if (error instanceof StudentDataFetchError) {
      return res.status(500).json({
        success: false,
        message: error.message,
        details: getRuntimeConfig().core.nodeEnv === 'development' ? error.originalError?.message : undefined,
      })
    }

    // Erro genérico
    return res.status(500).json({
      success: false,
      message: 'Erro interno ao buscar dados do estudante',
      details: getRuntimeConfig().core.nodeEnv === 'development' ? (error as Error).message : undefined,
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export default {
  getStudentComplete,
}
