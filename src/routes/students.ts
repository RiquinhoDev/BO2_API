// ══════════════════════════════════════════════════════════════════════
// 📁 src/routes/students.ts
// Rotas para endpoints de estudantes
// ══════════════════════════════════════════════════════════════════════

import express from 'express'
import studentsController from '../controllers/studentsController'
import * as studentHistoryController from '../controllers/studentHistory.controller'
import { asyncRoute } from '../security/asyncRoute'

const router = express.Router()

// ═══════════════════════════════════════════════════════════════
// GET /api/students/:userId/complete
// Buscar dados completos de um estudante (consolidado)
// ═══════════════════════════════════════════════════════════════

router.get('/:userId/complete', asyncRoute(studentsController.getStudentComplete))

// ═══════════════════════════════════════════════════════════════
// GET /api/students/:userId/history
// Buscar histórico completo de alterações do estudante
// ═══════════════════════════════════════════════════════════════

router.get('/:userId/history', asyncRoute(studentHistoryController.getStudentHistory))

// ═══════════════════════════════════════════════════════════════
// GET /api/students/:userId/history/summary
// Buscar resumo do histórico (estatísticas)
// ═══════════════════════════════════════════════════════════════

router.get('/:userId/history/summary', asyncRoute(studentHistoryController.getStudentHistorySummary))

// ═══════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════

export default router
