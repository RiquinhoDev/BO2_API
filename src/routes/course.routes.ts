// ════════════════════════════════════════════════════════════
// 📁 src/routes/course.routes.ts
// Rotas para Cursos
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import {
  getAllCourses,
  getCourseById,
  createCourse,
  updateCourse,
  deleteCourse
} from '../controllers/course.controller'

// ✅ ACTIVE CAMPAIGN: Importar rotas Clareza + OGI
import { 
  getClarezaStudents, 
  evaluateClarezaRules,
  getOGIStudents, 
  evaluateOGIRules 
} from '../controllers/acTags/activecampaign.controller'

const router = Router()

// ─────────────────────────────────────────────────────────────
// ROTAS CRUD
// ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/courses
 * @desc    Listar todos os cursos
 * @access  Admin
 */
router.get('/', getAllCourses)

/**
 * @route   GET /api/courses/:id
 * @desc    Buscar curso por ID
 * @access  Admin
 */
router.get('/:id', getCourseById)

/**
 * @route   POST /api/courses
 * @desc    Criar novo curso
 * @access  Admin
 */
router.post('/', createCourse)

/**
 * @route   PUT /api/courses/:id
 * @desc    Atualizar curso
 * @access  Admin
 */
router.put('/:id', updateCourse)

/**
 * @route   DELETE /api/courses/:id
 * @desc    Desativar curso
 * @access  Admin
 */
router.delete('/:id', deleteCourse)

// ─────────────────────────────────────────────────────────────
// ✅ ACTIVE CAMPAIGN: ROTAS ESPECÍFICAS CLAREZA + OGI
// ─────────────────────────────────────────────────────────────

/**
 * @route   GET /api/courses/clareza/students
 * @desc    Retorna lista e stats de alunos Clareza
 * @access  Admin
 */
router.get('/clareza/students', getClarezaStudents)

/**
 * @route   POST /api/courses/clareza/evaluate
 * @desc    Força avaliação de regras Clareza
 * @access  Admin
 */
router.post('/clareza/evaluate', evaluateClarezaRules)

/**
 * @route   GET /api/courses/ogi/students
 * @desc    Retorna lista e stats de alunos OGI
 * @access  Admin
 */
router.get('/ogi/students', getOGIStudents)

/**
 * @route   POST /api/courses/ogi/evaluate
 * @desc    Força avaliação de regras OGI
 * @access  Admin
 */
router.post('/ogi/evaluate', evaluateOGIRules)

export default router

