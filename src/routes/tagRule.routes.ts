// ════════════════════════════════════════════════════════════
// 📁 src/routes/tagRule.routes.ts
// Rotas para TagRules
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import {
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  testRule,
  executeRules
} from '../controllers/tagRule.controller'

const router = Router()

// ─────────────────────────────────────────────────────────────
// ROTAS CRUD
// ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/tag-rules
 * @desc    Listar todas as regras (com filtros)
 * @query   ?courseId=xxx&category=INACTIVITY&isActive=true
 * @access  Admin
 */
router.get('/', getAllRules)

/**
 * @route   GET /api/tag-rules/:id
 * @desc    Buscar regra por ID
 * @access  Admin
 */
router.get('/:id', getRuleById)

/**
 * @route   POST /api/tag-rules
 * @desc    Criar nova regra
 * @access  Admin
 */
router.post('/', createRule)

/**
 * @route   PUT /api/tag-rules/:id
 * @desc    Atualizar regra
 * @access  Admin
 */
router.put('/:id', updateRule)

/**
 * @route   DELETE /api/tag-rules/:id
 * @desc    Desativar regra
 * @access  Admin
 */
router.delete('/:id', deleteRule)

// ─────────────────────────────────────────────────────────────
// ROTAS ESPECIAIS
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/tag-rules/:id/test
 * @desc    Testar regra (dry run)
 * @body    { userId: "xxx" }
 * @access  Admin
 */
router.post('/:id/test', testRule)

/**
 * @route   POST /api/tag-rules/execute
 * @desc    Executar regras manualmente
 * @body    { courseId: "xxx" }
 * @access  Admin
 */
router.post('/execute', executeRules)

export default router

