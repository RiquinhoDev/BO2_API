// ================================================================
// 🛣️ CRON MANAGEMENT ROUTES
// ================================================================
// Rotas para gestão de CRON jobs
// ================================================================

import { Router } from 'express'
import cronManagementController from '../controllers/cronManagement.controller'

const router = Router()

// GET /api/cron/config - Obter configuração atual
router.get('/config', cronManagementController.getConfig)

// PUT /api/cron/config - Atualizar configuração (horário, ativo/pausado)
router.put('/config', cronManagementController.updateConfig)

// POST /api/cron/execute - Executar sincronização INTELIGENTE manualmente (novo sistema)
router.post('/execute', cronManagementController.executeNow)

// POST /api/cron/execute-legacy - Executar sincronização LEGADA (sistema antigo)
router.post('/execute-legacy', cronManagementController.executeLegacy)

// GET /api/cron/history - Histórico de execuções
router.get('/history', cronManagementController.getHistory)

// GET /api/cron/statistics - Estatísticas (últimos X dias)
router.get('/statistics', cronManagementController.getStatistics)

export default router

