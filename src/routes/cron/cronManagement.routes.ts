// ================================================================
// 🛣️ CRON MANAGEMENT ROUTES
// ================================================================
// Rotas para gestão de CRON jobs
// ================================================================

import { Router } from 'express'
import { withValidatedInput } from '../../security/validatedInput'
import { cronTagsExecuteInput } from '../../security/cronTagsDestructiveInput'
import cronManagementController from '../../controllers/cron/cronManagement.controller'



const router = Router()

// GET /api/cron/config - Obter configuração atual
router.get('/config', cronManagementController.getConfig)

// PUT /api/cron/config - Atualizar configuração (horário, ativo/pausado)
router.put('/config', cronManagementController.updateConfig)

// POST /api/cron/execute - Executar sincronização INTELIGENTE manualmente (novo sistema)
router.post('/execute', withValidatedInput(cronTagsExecuteInput, (input, _req, res) => cronManagementController.executeNow(input, res)))

// POST /api/cron/execute-legacy - Executar sincronização LEGADA (sistema antigo)
router.post('/execute-legacy', withValidatedInput(cronTagsExecuteInput, (input, _req, res) => cronManagementController.executeLegacy(input, res)))

// GET /api/cron/history - Histórico de execuções
router.get('/history', cronManagementController.getHistory)

// GET /api/cron/statistics - Estatísticas (últimos X dias)
router.get('/statistics', cronManagementController.getStatistics)
// GET /api/cron/jobs/:id/history - Histórico de execuções de um job
router.get('/jobs/:id/history', cronManagementController.getJobHistory)

// POST /api/cron/validate - Validar cron expression
router.post('/validate', cronManagementController.validateCronExpression)

// GET /api/cron/status - Status geral do sistema
router.get('/status', cronManagementController.getCronStatus)



export default router

