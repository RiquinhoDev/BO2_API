// ════════════════════════════════════════════════════════════
// 📁 src/controllers/tagRule.controller.ts
// Controller CRUD para TagRules
// ════════════════════════════════════════════════════════════

import type { RequestHandler } from 'express'
import { Course, TagRule } from '../../models'
import tagRuleEngine from '../../services/ac/tagRuleEngine'

// ─────────────────────────────────────────────────────────────
// LISTAR TODAS AS REGRAS (com filtros)
// ─────────────────────────────────────────────────────────────

export const getAllRules: RequestHandler = async (req, res) => {
  try {
    const { courseId, category, isActive } = req.query

    const filter: any = {}
    if (courseId) filter.courseId = courseId
    if (category) filter.category = category
    if (isActive !== undefined) filter.isActive = isActive === 'true'

    const rules = await TagRule.find(filter)
      .populate('courseId', 'name code')
      .sort({ priority: -1, name: 1 })

    res.json({
      success: true,
      count: rules.length,
      data: rules
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao listar regras:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

// ─────────────────────────────────────────────────────────────
// BUSCAR REGRA POR ID
// ─────────────────────────────────────────────────────────────

export const getRuleById: RequestHandler = async (req, res) => {
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
  } catch (error: any) {
    console.error('❌ Erro ao buscar regra:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

// ─────────────────────────────────────────────────────────────
// CRIAR NOVA REGRA
// ─────────────────────────────────────────────────────────────

export const createRule: RequestHandler = async (req, res) => {
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

    console.log(`✅ Regra criada: ${rule.name}`)

    res.status(201).json({
      success: true,
      data: rule
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao criar regra:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

// ─────────────────────────────────────────────────────────────
// ATUALIZAR REGRA
// ─────────────────────────────────────────────────────────────

export const updateRule: RequestHandler = async (req, res) => {
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

    console.log(`✅ Regra atualizada: ${rule.name}`)

    res.json({
      success: true,
      data: rule
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao atualizar regra:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

// ─────────────────────────────────────────────────────────────
// DELETAR REGRA (soft delete)
// ─────────────────────────────────────────────────────────────

export const deleteRule: RequestHandler = async (req, res) => {
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

    console.log(`🗑️ Regra desativada: ${rule.name}`)

    res.json({
      success: true,
      message: 'Regra desativada com sucesso'
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao deletar regra:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

// ─────────────────────────────────────────────────────────────
// TESTAR REGRA (dry run)
// ─────────────────────────────────────────────────────────────

export const testRule: RequestHandler = async (req, res) => {
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

    res.json({
      success: true,
      message: 'Teste de regra (em desenvolvimento)'
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao testar regra:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR REGRAS MANUALMENTE
// ─────────────────────────────────────────────────────────────

export const executeRules: RequestHandler = async (req, res) => {
  try {
    const { courseId } = req.body as { courseId?: string }

    const course = await Course.findById(courseId)
    if (!course) {
      res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
      return
    }

    console.log(`🚀 Executando regras para curso ${course.name}...`)

    // Executar em background
    tagRuleEngine
      .evaluateAllUsersInCourse(course._id)
      .catch(err => console.error('❌ Erro na execução:', err))

    res.json({
      success: true,
      message: 'Execução iniciada em background'
    })
    return
  } catch (error: any) {
    console.error('❌ Erro ao executar regras:', error)
    res.status(500).json({
      success: false,
      error: error?.message || 'Erro interno do servidor'
    })
    return
  }
}
