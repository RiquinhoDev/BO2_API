// ================================================================
// 📁 src/routes/reengagement.routes.ts
// ROTAS: Sistema de Re-engagement (Testes e Gestão)
// ================================================================

import { Router } from 'express'
import * as reengagementController from '../controllers/reengagement.controller'
import { reengagementExecuteInput } from '../security/reengagementDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

/**
 * @route   POST /api/reengagement/evaluate/:userId
 * @desc    Avaliar decisão para um aluno específico (TESTE)
 * @body    { productCode: string }
 * @access  Private
 */
router.post('/evaluate/:userId', reengagementController.evaluateStudent)

/**
 * @route   POST /api/reengagement/evaluate/:userId/execute
 * @desc    Avaliar E EXECUTAR decisão para um aluno (TESTE)
 * @body    { productCode: string, dryRun?: boolean }
 * @access  Private (Admin)
 */
router.post(
  '/evaluate/:userId/execute',
  withValidatedInput(reengagementExecuteInput, (input, _req, res) =>
    reengagementController.evaluateAndExecute(input, res)),
)

/**
 * @route   POST /api/reengagement/evaluate-batch
 * @desc    Avaliar múltiplos alunos de uma vez
 * @body    { userIds: string[], productCode: string }
 * @access  Private
 */
router.post('/evaluate-batch', reengagementController.evaluateBatch)

/**
 * @route   GET /api/reengagement/stats/:productCode
 * @desc    Obter estatísticas de decisões para um produto
 * @access  Private
 */
router.get('/stats/:productCode', reengagementController.getDecisionStats)

/**
 * @route   GET /api/reengagement/state/:userId/:productCode
 * @desc    Obter estado de engagement de um aluno
 * @access  Private
 */
router.get('/state/:userId/:productCode', reengagementController.getStudentState)

/**
 * @route   POST /api/reengagement/simulate/:productCode
 * @desc    Simular execução completa para um produto (DRY RUN)
 * @body    { limit?: number }
 * @access  Private
 */
router.post('/simulate/:productCode', reengagementController.simulateProductRun)

/**
 * @route   POST /api/reengagement/reset/:userId/:productCode
 * @desc    Resetar estado de engagement de um aluno (TESTE)
 * @access  Private (Admin)
 */
router.post('/reset/:userId/:productCode', reengagementController.resetStudentState)

export default router
