// ════════════════════════════════════════════════════════════
// 📁 src/controllers/tagRule.controller.ts
// Controller CRUD para TagRules
import logger from '../../utils/logger'
import { successResponse } from '../../contracts/responseContract'
// ════════════════════════════════════════════════════════════

import type { RequestHandler } from 'express'
import { internalError } from '../../security/errorHandling'
import { Course, TagRule } from '../../models'

// ─────────────────────────────────────────────────────────────
// LISTAR TODAS AS REGRAS (com filtros)
// ─────────────────────────────────────────────────────────────

export const getAllRules: RequestHandler = async (req, res, next) => {
  try {
    const { courseId, category, isActive } = req.query

    const filter: any = {}
    if (courseId) filter.courseId = courseId
    if (category) filter.category = category
    if (isActive !== undefined) filter.isActive = isActive === 'true'

    const rules = await TagRule.find(filter)
      .populate('courseId', 'name code')
      .sort({ priority: -1, name: 1 })

    res.json(successResponse(rules, { count: rules.length }))
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_LIST_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// BUSCAR REGRA POR ID
// ─────────────────────────────────────────────────────────────

export const getRuleById: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params

    const rule = await TagRule.findById(id).populate('courseId', 'name code')

    if (!rule) {
      res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
      return
    }

    res.json({
      success: true,
      data: rule
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_READ_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// CRIAR NOVA REGRA
// ─────────────────────────────────────────────────────────────

export const createRule: RequestHandler = async (req, res, next) => {
  try {
    const ruleData = req.body

    // Verificar se curso existe
    const course = await Course.findById(ruleData.courseId)
    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
      return
    }

    const rule = await TagRule.create(ruleData)

    logger.info(`✅ Regra criada: ${rule.name}`)

    res.status(201).json({
      success: true,
      data: rule
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_CREATE_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// ATUALIZAR REGRA
// ─────────────────────────────────────────────────────────────

export const updateRule: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const updates = req.body

    const rule = await TagRule.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true
    })

    if (!rule) {
      res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
      return
    }

    logger.info(`✅ Regra atualizada: ${rule.name}`)

    res.json({
      success: true,
      data: rule
    })
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_UPDATE_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// DELETAR REGRA (soft delete)
// ─────────────────────────────────────────────────────────────

export const deleteRule: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params

    const rule = await TagRule.findByIdAndUpdate(id, { isActive: false }, { new: true })

    if (!rule) {
      res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
      return
    }

    logger.info(`🗑️ Regra desativada: ${rule.name}`)

    res.json(successResponse(null, { message: 'Regra desativada com sucesso' }))
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_DELETE_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// TESTAR REGRA (dry run)
// ─────────────────────────────────────────────────────────────

export const testRule: RequestHandler = async (req, res, next) => {
  try {
    const { id } = req.params
    const { userId } = req.body as { userId?: string }

    const rule = await TagRule.findById(id)
    if (!rule) {
      res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
      return
    }

    // TODO: Implementar teste dry-run
    // (avaliar condições sem executar ações)
    void userId // só para não ficar "unused" se ainda não implementaste

    res.json(successResponse(null, { message: 'Teste de regra (em desenvolvimento)' }))
    return
  } catch (error: unknown) {
    next(internalError('Erro interno do servidor', 'TAG_RULE_TEST_FAILED', error))
    return
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ EXECUTAR REGRAS REMOVIDO
// Use DecisionEngine via /api/activecampaign/test-cron
// ─────────────────────────────────────────────────────────────
