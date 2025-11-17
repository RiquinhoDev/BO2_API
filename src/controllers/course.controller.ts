// ════════════════════════════════════════════════════════════
// 📁 src/controllers/course.controller.ts
// Controller CRUD para Cursos
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import Course from '../models/Course'
import TagRule from '../models/TagRule'

// ─────────────────────────────────────────────────────────────
// LISTAR TODOS OS CURSOS
// ─────────────────────────────────────────────────────────────

export const getAllCourses = async (req: Request, res: Response) => {
  try {
    const courses = await Course.find().sort({ name: 1 })
    
    res.json({
      success: true,
      count: courses.length,
      data: courses
    })
  } catch (error: any) {
    console.error('❌ Erro ao listar cursos:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// BUSCAR CURSO POR ID
// ─────────────────────────────────────────────────────────────

export const getCourseById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    
    const course = await Course.findById(id)
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
    }

    // Buscar regras associadas
    const rules = await TagRule.find({ 
      courseId: course._id,
      isActive: true 
    }).sort({ priority: -1 })

    res.json({
      success: true,
      data: {
        course,
        rulesCount: rules.length
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar curso:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// CRIAR NOVO CURSO
// ─────────────────────────────────────────────────────────────

export const createCourse = async (req: Request, res: Response) => {
  try {
    const courseData = req.body
    
    // Verificar se código já existe
    const existing = await Course.findOne({ code: courseData.code })
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `Curso com código ${courseData.code} já existe`
      })
    }

    const course = await Course.create(courseData)
    
    console.log(`✅ Curso criado: ${course.name}`)

    res.status(201).json({
      success: true,
      data: course
    })
  } catch (error: any) {
    console.error('❌ Erro ao criar curso:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ATUALIZAR CURSO
// ─────────────────────────────────────────────────────────────

export const updateCourse = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const updates = req.body
    
    const course = await Course.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
    }

    console.log(`✅ Curso atualizado: ${course.name}`)

    res.json({
      success: true,
      data: course
    })
  } catch (error: any) {
    console.error('❌ Erro ao atualizar curso:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

// ─────────────────────────────────────────────────────────────
// DELETAR CURSO (soft delete)
// ─────────────────────────────────────────────────────────────

export const deleteCourse = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    
    // Soft delete - apenas desativar
    const course = await Course.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    )
    
    if (!course) {
      return res.status(404).json({
        success: false,
        error: 'Curso não encontrado'
      })
    }

    // Desativar também todas as regras associadas
    await TagRule.updateMany(
      { courseId: course._id },
      { isActive: false }
    )

    console.log(`🗑️ Curso desativado: ${course.name}`)

    res.json({
      success: true,
      message: 'Curso desativado com sucesso'
    })
  } catch (error: any) {
    console.error('❌ Erro ao deletar curso:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

