// ════════════════════════════════════════════════════════════
// 📁 src/routes/tagRule.routes.ts
// Rotas para TagRules
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { asyncRoute } from '../../security/asyncRoute'
import { createRule, deleteRule, getAllRules, getRuleById, testRule, updateRule } from '../../controllers/acTags/tagRule.controller'

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
router.get('/', asyncRoute(getAllRules))

/**
 * @route   GET /api/tag-rules/:id
 * @desc    Buscar regra por ID
 * @access  Admin
 */
router.get('/:id', asyncRoute(getRuleById))

/**
 * @route   POST /api/tag-rules
 * @desc    Criar nova regra
 * @access  Admin
 */
router.post('/', asyncRoute(createRule))

/**
 * @route   PUT /api/tag-rules/:id
 * @desc    Atualizar regra
 * @access  Admin
 */
router.put('/:id', asyncRoute(updateRule))

/**
 * @route   DELETE /api/tag-rules/:id
 * @desc    Desativar regra
 * @access  Admin
 */
router.delete('/:id', asyncRoute(deleteRule))

// ─────────────────────────────────────────────────────────────
// ROTAS ESPECIAIS
// ─────────────────────────────────────────────────────────────

/**
 * @route   POST /api/tag-rules/:id/test
 * @desc    Testar regra (dry run)
 * @body    { userId: "xxx" }
 * @access  Admin
 */
router.post('/:id/test', asyncRoute(testRule))

/**
 * @route   POST /api/tag-rules/execute
 * @desc    ✅ REMOVIDO - Use POST /api/activecampaign/test-cron
 * @deprecated Use o endpoint de teste de cron para execução manual
 */
// router.post('/execute', executeRules)  // ❌ REMOVIDO

export default router

