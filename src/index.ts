// ⚠️ CRITICAL: dotenv.config() MUST be the first thing executed!
import dotenv from "dotenv"
dotenv.config()

import express from "express"
import cors from "cors"
import mongoose from "mongoose"
import router from "./routes"

// ✅ SPRINT 7: Importar sistema de monitorização
import metricsMiddleware from "./middleware/metrics.middleware"
import metricsRoutes from "./routes/metrics.routes"
import systemMonitor from "./services/systemMonitor.service"
import productSalesStatsRoutes from './routes/productSalesStats.routes'

// ✅ ACTIVE CAMPAIGN: Importar CRON job e rotas
import './jobs/evaluateRules.job'
import activecampaignRoutes from './routes/activecampaign.routes'
import webhooksRoutes from './routes/webhooks.routes'
import healthRoutes from './routes/health.routes'
import cronManagementRoutes from './routes/cronManagement.routes'
import cronManagementService from './services/cronManagement.service'

// 🆕 SYNC UTILIZADORES FASE 1: Importar NOVO scheduler (nome diferente!)
import syncSchedulerService from './services/syncUtilziadoresServices/scheduler'

// 🔥 WARM-UP: Importar função de pré-aquecimento do cache
import { warmUpCache } from './services/dualReadService'

// 📊 DASHBOARD STATS: Importar CRON job de rebuild
import { startRebuildDashboardStatsJob } from './jobs/rebuildDashboardStats.job'
import { buildDashboardStats } from './services/dashboardStatsBuilder.service'

// ✅ ACTIVE CAMPAIGN: Importar controllers para Tag Rules e Communication History
import {
  getAllTagRules,
  createTagRule,
  updateTagRule,
  deleteTagRule,
  getCommunicationHistory
} from './controllers/acTags/activecampaign.controller'

// Importar todos os modelos diretamente para garantir que estejam disponíveis
import "./models/user"
import "./models/Class"
import "./models/Testimonial"
import "./models/Admin"
import "./models/HotmartWebhook"
import "./models/IdsDiferentes"
import "./models/InactivationList"
import "./models/StudentClassHistory"
import "./models/SyncHistory"
import "./models/UnmatchedUser"
import "./models/ClassAnalytics"
import "./models/Course"
import "./models/TagRule"
import "./models/UserAction"
import "./models/CommunicationHistory"
import "./models/CronConfig"
import "./models/CronExecution"
import "./models/DashboardStats"

// 🆕 SYNC UTILIZADORES FASE 1: Importar novos modelos
import "./models/SyncModels/CronJobConfig"
import "./models/SyncModels/ActivitySnapshot"
import "./models/SyncModels/SyncConflict"

import businessAnalyticsRoutes from './routes/businessAnalytics.routes'
import "./models"

// Importar inicializador de CRON jobs
import jobScheduler from "./jobs"
import { startRebuildProductSalesStatsJob } from "./jobs/rebuildProductSalesStats.job"
import analyticsCacheService from "./services/analyticsCache.service"
import cohortAnalyticsRoutes from './routes/cohortAnalytics.routes'

const app = express()
const PORT = process.env.PORT || 3001

// Conexão ao MongoDB
mongoose.connect(process.env.MONGO_URI || "")
  .then(async () => {
    console.log("✅ Ligado ao MongoDB")
    
    // Inicializar CRON jobs após conexão MongoDB
    try {
      jobScheduler.startAll()
    } catch (error) {
      console.error("⚠️ Erro ao inicializar jobs (continuando sem jobs):", error)
    }

    // ✅ CRON MANAGEMENT: Inicializar CRON jobs de gestão (sistema antigo)
    try {
      await cronManagementService.initializeCronJobs()
      console.log("✅ CRON Management (antigo) iniciado com sucesso")
    } catch (error) {
      console.error("⚠️ Erro ao inicializar CRON Management:", error)
    }

    // 🆕 SYNC UTILIZADORES FASE 1: Inicializar NOVO scheduler
    try {
      console.log('\n🆕 ============================================')
      console.log('🆕 Inicializando Sync Utilizadores FASE 1...')
      console.log('🆕 ============================================\n')
      
      await syncSchedulerService.initializeScheduler()
      
      console.log('\n✅ ============================================')
      console.log('✅ Sync Utilizadores FASE 1 inicializado!')
      console.log('✅ ============================================\n')
    } catch (error) {
      console.error("⚠️ Erro ao inicializar Sync Utilizadores FASE 1:", error)
    }

    // ✅ SPRINT 7: Iniciar System Monitor em produção
    if (process.env.NODE_ENV === 'production') {
      systemMonitor.start()
    }

    // 🔥 WARM-UP: Pré-aquecer cache ao iniciar servidor
    console.log('\n🔥 ============================================')
    console.log('🔥 Iniciando warm-up do cache...')
    console.log('🔥 ============================================\n')
    await warmUpCache()
    console.log('\n✅ ============================================')
    console.log('✅ Cache pré-aquecido! Servidor pronto.')
    console.log('✅ ============================================\n')
    
    // 📊 DASHBOARD STATS: Construir stats iniciais (DEPOIS do warm-up!)
    console.log('\n📊 ============================================')
    console.log('📊 Construindo Dashboard Stats iniciais...')
    console.log('📊 (Usando cache já aquecido)')
    console.log('📊 ============================================\n')
    await buildDashboardStats()
    console.log('\n✅ ============================================')
    console.log('✅ Dashboard Stats iniciais construídos!')
    console.log('✅ Servidor 100% PRONTO!')
    console.log('✅ ============================================\n')
    
    // 📊 DASHBOARD STATS: Iniciar CRON job de rebuild
    startRebuildDashboardStatsJob()

    // 📊 PRODUCT SALES: Iniciar CRON job se habilitado
    if (process.env.ENABLE_PRODUCT_SALES_CRON !== 'false') {
      startRebuildProductSalesStatsJob()
      console.log('✅ CRON Product Sales Stats iniciado (02:00 diariamente)')
    } else {
      console.log('⏭️  CRON Product Sales Stats desativado (ENABLE_PRODUCT_SALES_CRON=false)')
    }

    // Analytics cache warm-up
    analyticsCacheService.warmUpCache().catch(err => {
      console.error('⚠️ Erro ao aquecer cache de analytics:', err)
    })
  })
  .catch((err) => {
    console.error("❌ Erro ao ligar ao MongoDB:", err)
    process.exit(1)
  })

// Middleware
app.use(cors())
app.use(express.json())
app.use(metricsMiddleware)

// Rotas principais
app.use("/api", router)

// Analytics routes
app.use('/api/analytics/cohort', cohortAnalyticsRoutes)
app.use('/api/analytics/product-sales', productSalesStatsRoutes)
app.use('/api/business-analytics', businessAnalyticsRoutes)

// System routes
app.use("/api/metrics", metricsRoutes)
app.use('/api', healthRoutes)

// Active Campaign routes
app.use('/api/activecampaign', activecampaignRoutes)
app.use('/api/webhooks', webhooksRoutes)

// Tag Rules (inline routes)
app.get('/api/tag-rules', getAllTagRules)
app.post('/api/tag-rules', createTagRule)
app.put('/api/tag-rules/:id', updateTagRule)
app.delete('/api/tag-rules/:id', deleteTagRule)

// Communication History
app.get('/api/communication-history', getCommunicationHistory)

// CRON Management routes
app.use('/api/cron-old', cronManagementRoutes) // Sistema antigo

// 🆕 SYNC UTILIZADORES FASE 1: As rotas são adicionadas no router principal
// Ver src/routes/index.ts onde estão:
// router.use('/cron', cronRoutes)
// router.use('/sync', syncStatsRoutes)

// Logs de confirmação
console.log('✅ Routes: /api/analytics/cohort')
console.log('✅ Routes: /api/analytics/product-sales')
console.log('✅ Routes: /api/business-analytics')
console.log('✅ Routes: /api/cron-old (sistema antigo)')
console.log('✅ Routes: /api/cron (FASE 1 - via router principal)')
console.log('✅ Routes: /api/sync (FASE 1 - via router principal)')

app.listen(PORT, () => {
  console.log(`\n🚀 ============================================`)
  console.log(`🚀 Servidor iniciado em http://localhost:${PORT}/api`)
  console.log(`🚀 ============================================`)
  console.log(`📊 Métricas: http://localhost:${PORT}/api/metrics`)
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`)
  console.log(`📧 Active Campaign: http://localhost:${PORT}/api/activecampaign`)
  console.log(`🕐 CRON Management (antigo): http://localhost:${PORT}/api/cron-old`)
  console.log(`🆕 CRON Management (FASE 1): http://localhost:${PORT}/api/cron`)
  console.log(`🆕 Sync Stats (FASE 1): http://localhost:${PORT}/api/sync`)
  console.log(`============================================\n`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📥 SIGTERM recebido. Encerrando graciosamente...')
  
  systemMonitor.stop()
  
  // 🆕 SYNC UTILIZADORES FASE 1: Parar scheduler
  try {
    syncSchedulerService.stopScheduler()
    console.log('✅ Sync Utilizadores scheduler parado')
  } catch (error) {
    console.error('⚠️ Erro ao parar scheduler:', error)
  }
  
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('📥 SIGINT recebido. Encerrando graciosamente...')
  
  systemMonitor.stop()
  
  // 🆕 SYNC UTILIZADORES FASE 1: Parar scheduler
  try {
    syncSchedulerService.stopScheduler()
    console.log('✅ Sync Utilizadores scheduler parado')
  } catch (error) {
    console.error('⚠️ Erro ao parar scheduler:', error)
  }
  
  process.exit(0)
})