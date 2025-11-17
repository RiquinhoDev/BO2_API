// src/routes/analytics.routes.ts - Rotas Completas para Analytics
import { Router } from 'express'
import { analyticsController } from '../controllers/analytics.controller'

const router = Router()

// ===== ANALYTICS COMPLETOS DE TURMA =====
// GET /api/analytics/class/:classId - Analytics completas de uma turma (com cache)
// Parâmetros query opcionais: ?force=true (para forçar recálculo)
router.get('/class/:classId', analyticsController.getClassAnalytics)

// ===== RECÁLCULOS =====
// POST /api/analytics/class/:classId/recalculate - Forçar recálculo da turma
router.post('/class/:classId/recalculate', analyticsController.recalculateClassScores)

// POST /api/analytics/class/:classId/recalculate-individual - Recalcular scores individuais dos alunos
router.post('/class/:classId/recalculate-individual', analyticsController.recalculateIndividualScores)

// ===== MÉTRICAS ESPECÍFICAS =====
// GET /api/analytics/class/:classId/health - Health Score específico
router.get('/class/:classId/health', analyticsController.getHealthScore)

// GET /api/analytics/health-score/:classId - Health Score específico (rota alternativa para compatibilidade)
router.get('/health-score/:classId', analyticsController.getHealthScore)

// GET /api/analytics/class/:classId/engagement - Distribuição de engagement
router.get('/class/:classId/engagement', analyticsController.getEngagementDistribution)

// GET /api/analytics/class/:classId/alerts - Alertas da turma
router.get('/class/:classId/alerts', analyticsController.getClassAlerts)

// GET /api/analytics/class/:classId/quick - Estatísticas rápidas (sem cache pesado)
router.get('/class/:classId/quick', analyticsController.getQuickStats)

// ===== MANUTENÇÃO DE CACHE =====
// GET /api/analytics/outdated - Listar turmas com cache desatualizado
router.get('/outdated', analyticsController.getOutdatedClasses)

// ===== ANALYTICS AVANÇADOS (ATIVOS) =====
// GET /api/analytics/global - Visão geral de todas as turmas
router.get('/global', analyticsController.getGlobalAnalytics)

// GET /api/analytics/benchmarks - Benchmarks da indústria
router.get('/benchmarks', analyticsController.getBenchmarks)

// GET /api/analytics/opportunities/:classId - Oportunidades de melhoria
router.get('/opportunities/:classId', analyticsController.getOpportunities)

// GET /api/analytics/compare?classIds=id1,id2,id3 - Comparar múltiplas turmas
router.get('/compare', analyticsController.compareClasses)

// ✅ NOVO: GET /api/analytics/multi-platform - Analytics multi-plataforma (Fase 5)
router.get('/multi-platform', analyticsController.getMultiPlatformAnalytics)

export default router

