// src/routes/lessons.routes.ts
import { Router } from 'express'
import { lessonsController } from '../controllers/lessons.controller'

const router = Router()

// 📚 BUSCAR LIÇÕES DE UTILIZADOR ESPECÍFICO
// GET /api/lessons/user/:userId
// Query params: subdomain, userEmail?, userName?
router.get('/user/:userId', lessonsController.getUserLessons)

// 🎯 BUSCAR LIÇÕES INTEGRADAS COM DADOS DO SISTEMA
// GET /api/lessons/user/:userId/integrated
// Query params: subdomain
router.get('/user/:userId/integrated', lessonsController.getUserLessonsIntegrated)

// 📊 BUSCAR LIÇÕES DE MÚLTIPLOS UTILIZADORES
// POST /api/lessons/multiple
// Body: { userIds: string[], subdomain: string }
router.post('/multiple', lessonsController.getMultipleUsersLessons)

// 📈 ESTATÍSTICAS DE PROGRESSO DAS LIÇÕES
// GET /api/lessons/stats
// Query params: subdomain, userIds (comma-separated)
router.get('/stats', lessonsController.getLessonsStats)

// 🧪 TESTAR CONEXÃO COM HOTMART
// GET /api/lessons/test
// Query params: subdomain, testUserId
router.get('/test', lessonsController.testHotmartConnection)

export default router