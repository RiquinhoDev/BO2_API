// src/routes/analytics.routes.ts - Rotas Completas para Analytics
import { Router } from 'express'
import { analyticsController } from '../controllers/analytics.controller'
import { classAnalyticsController } from '../controllers/analytics/classAnalytics.controller'
import { compareClasses } from '../services/analytics/classComparison.runtime'
import { getClassOpportunities } from '../services/analytics/classOpportunities.runtime'
import { getClassQuickStats } from '../services/analytics/classQuickStats.runtime'
import { getGlobalAnalytics } from '../services/analytics/globalAnalytics.runtime'
import {
  classAnalyticsClassInput,
  classAnalyticsEmptyInput,
  classAnalyticsQueryInput,
} from '../security/classAnalyticsInput'
import { classQuickStatsInput } from '../security/classQuickStatsInput'
import { classComparisonInput } from '../security/classComparisonInput'
import { globalAnalyticsInput } from '../security/globalAnalyticsInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

// ===== ANALYTICS COMPLETOS DE TURMA =====
// GET /api/analytics/class/:classId - Analytics completas de uma turma (com cache)
// Parâmetros query opcionais: ?force=true (para forçar recálculo)
router.get(
  '/class/:classId',
  withValidatedInput(
    classAnalyticsQueryInput,
    classAnalyticsController.getClassAnalytics,
  ),
)

// ===== RECÁLCULOS =====
// POST /api/analytics/class/:classId/recalculate - Forçar recálculo da turma
router.post(
  '/class/:classId/recalculate',
  withValidatedInput(
    classAnalyticsClassInput,
    classAnalyticsController.recalculateClassScores,
  ),
)

// POST /api/analytics/class/:classId/recalculate-individual - Recalcular scores individuais dos alunos
router.post('/class/:classId/recalculate-individual', analyticsController.recalculateIndividualScores)

// ===== MÉTRICAS ESPECÍFICAS =====
// GET /api/analytics/class/:classId/health - Health Score específico
router.get(
  '/class/:classId/health',
  withValidatedInput(
    classAnalyticsClassInput,
    classAnalyticsController.getHealthScore,
  ),
)

// GET /api/analytics/health-score/:classId - Health Score específico (rota alternativa para compatibilidade)
router.get(
  '/health-score/:classId',
  withValidatedInput(
    classAnalyticsClassInput,
    classAnalyticsController.getHealthScore,
  ),
)

// GET /api/analytics/class/:classId/engagement - Distribuição de engagement
router.get(
  '/class/:classId/engagement',
  withValidatedInput(
    classAnalyticsClassInput,
    classAnalyticsController.getEngagementDistribution,
  ),
)

// GET /api/analytics/class/:classId/alerts - Alertas da turma
router.get(
  '/class/:classId/alerts',
  withValidatedInput(
    classAnalyticsClassInput,
    classAnalyticsController.getClassAlerts,
  ),
)

// GET /api/analytics/class/:classId/quick - Estatísticas rápidas (sem cache pesado)
router.get(
  '/class/:classId/quick',
  withValidatedInput(classQuickStatsInput, getClassQuickStats),
)

// ===== MANUTENÇÃO DE CACHE =====
// GET /api/analytics/outdated - Listar turmas com cache desatualizado
router.get(
  '/outdated',
  withValidatedInput(
    classAnalyticsEmptyInput,
    classAnalyticsController.getOutdatedClasses,
  ),
)

// ===== ANALYTICS AVANÇADOS (ATIVOS) =====
// GET /api/analytics/global - Visão geral de todas as turmas
router.get(
  '/global',
  withValidatedInput(globalAnalyticsInput, getGlobalAnalytics),
)

// GET /api/analytics/benchmarks - Benchmarks da indústria
router.get('/benchmarks', analyticsController.getBenchmarks)

// GET /api/analytics/opportunities/:classId - Oportunidades de melhoria
router.get(
  '/opportunities/:classId',
  withValidatedInput(classAnalyticsClassInput, getClassOpportunities),
)

// GET /api/analytics/compare?classIds=id1,id2,id3 - Comparar múltiplas turmas
router.get(
  '/compare',
  withValidatedInput(classComparisonInput, compareClasses),
)

// ✅ NOVO: GET /api/analytics/multi-platform - Analytics multi-plataforma (Fase 5)
router.get('/multi-platform', analyticsController.getMultiPlatformAnalytics)

export default router
