// =====================================================
// 📁 src/routes/ogiCourse.routes.ts
// Rotas para o curso OGI
// =====================================================

import { Router } from 'express'
import { getOGIStudents, evaluateOGIRules } from '../controllers/ogiCourse.controller'

const router = Router()

/**
 * GET /api/courses/ogi/students
 * Retorna lista e stats de alunos OGI
 */
router.get('/ogi/students', getOGIStudents)

/**
 * POST /api/courses/ogi/evaluate
 * Força avaliação de regras OGI
 */
router.post('/ogi/evaluate', evaluateOGIRules)

export default router

