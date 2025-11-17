// ════════════════════════════════════════════════════════════
// 📁 src/controllers/tagRule.controller.ts
// Controller CRUD para TagRules
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import TagRule from '../models/TagRule'
import Course from '../models/Course'
import tagRuleEngine from '../services/tagRuleEngine'

// ─────────────────────────────────────────────────────────────
// LISTAR TODAS AS REGRAS (com filtros)
// ─────────────────────────────────────────────────────────────

export const getAllRules = async (req: Request, res: Response) => {
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
  } catch (error: any) {
    console.error('❌ Erro ao listar regras:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// BUSCAR REGRA POR ID
// ─────────────────────────────────────────────────────────────

export const getRuleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    
    const rule = await TagRule.findById(id).populate('courseId', 'name code')
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
    }

    res.json({
      success: true,
      data: rule
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar regra:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// CRIAR NOVA REGRA
// ─────────────────────────────────────────────────────────────

export const createRule = async (req: Request, res: Response) => {
  try {
    const ruleData = req.body
    
    // Verificar se curso existe
    const course = await Course.findById(ruleData.courseId)
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
    }

    const rule = await TagRule.create(ruleData)
    
    console.log(`✅ Regra criada: ${rule.name}`)

    res.status(201).json({
      success: true,
      data: rule
    })
  } catch (error: any) {
    console.error('❌ Erro ao criar regra:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ATUALIZAR REGRA
// ─────────────────────────────────────────────────────────────

export const updateRule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    const rule = await TagRule.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
    }

    console.log(`✅ Regra atualizada: ${rule.name}`)

    res.json({
      success: true,
      data: rule
    })
  } catch (error: any) {
    console.error('❌ Erro ao atualizar regra:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// DELETAR REGRA (soft delete)
// ─────────────────────────────────────────────────────────────

export const deleteRule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    
    const rule = await TagRule.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    )
    
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
    }

    console.log(`🗑️ Regra desativada: ${rule.name}`)

    res.json({
      success: true,
      message: 'Regra desativada com sucesso'
    })
  } catch (error: any) {
    console.error('❌ Erro ao deletar regra:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// TESTAR REGRA (dry run)
// ─────────────────────────────────────────────────────────────

export const testRule = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { userId } = req.body
    
    const rule = await TagRule.findById(id)
    if (!rule) {
      return res.status(404).json({
        success: false,
        error: 'Regra não encontrada'
      })
    }

    // TODO: Implementar teste dry-run
    // (avaliar condições sem executar ações)

    res.json({
      success: true,
      message: 'Teste de regra (em desenvolvimento)'
    })
  } catch (error: any) {
    console.error('❌ Erro ao testar regra:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// EXECUTAR REGRAS MANUALMENTE
// ─────────────────────────────────────────────────────────────

export const executeRules = async (req: Request, res: Response) => {
  try {
    const { courseId } = req.body
    
    const course = await Course.findById(courseId)
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
    }

    console.log(`🚀 Executando regras para curso ${course.name}...`)

    // Executar em background
    tagRuleEngine.evaluateAllUsersInCourse(course._id)
      .catch(error => console.error('❌ Erro na execução:', error))

    res.json({
      success: true,
      message: 'Execução iniciada em background'
    })
  } catch (error: any) {
    console.error('❌ Erro ao executar regras:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

