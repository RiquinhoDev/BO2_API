import dotenv from "dotenv"
dotenv.config()

import express from "express"
import cors from "cors"
import compression from "compression"
import mongoose from "mongoose"
import router from "./routes"

import metricsMiddleware from "./middleware/metrics.middleware"
import metricsRoutes from "./routes/metrics.routes"
import systemMonitor from "./services/systemMonitor.service"
import productSalesStatsRoutes from './routes/productSalesStats.routes'
import './jobs/evaluateRules.job'
import activecampaignRoutes from './routes/ACroutes/activecampaign.routes'
import webhooksRoutes from './routes/webhooks.routes'
import healthRoutes from './routes/health.routes'
import validationLogsRoutes from './routes/validationLogs.routes'
import courseLessonsRoutes from './routes/courseLessons.routes'

import { warmUpCache } from './services/syncUtilizadoresServices/dualReadService'
import cronManagementRoutes from './routes/cron/cronManagement.routes'


import { buildDashboardStats } from './services/dashboardStatsBuilder.service'

import './jobs/cronExecutionCleanup.job'  // ✅ SÓ ISTO! Nada mais!

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
import "./models/acTags/TagRule"
import "./models/UserAction"
import "./models/acTags/CommunicationHistory"
import "./models/cron/CronConfig"
import "./models/cron/CronExecution"
import "./models/DashboardStats"
import "./models/CourseLesson"

// 🆕 SYNC UTILIZADORES FASE 1: Importar novos modelos
import "./models/SyncModels/CronJobConfig"
import "./models/SyncModels/ActivitySnapshot"
import "./models/SyncModels/SyncConflict"
import "./models/ClarezaMarketData"

import businessAnalyticsRoutes from './routes/businessAnalytics.routes'
import "./models"

// Importar inicializador de CRON jobs
import jobScheduler from "./jobs"
import analyticsCacheService from "./services/analytics/analyticsCache.service"
import cohortAnalyticsRoutes from './routes/cohortAnalytics.routes'
import testHistoryRoutes from './routes/testHistory.routes'
import syncSchedulerService from "./services/cron/scheduler"

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


    console.log("⏭️ CRON Management (antigo) desativado - usando DailyPipeline às 02:00")

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

    // 📈 CLAREZA: Criar cron job 3×/dia se ainda não existir
    try {
      const CronJobConfig = (await import('./models/SyncModels/CronJobConfig')).default
      const systemCronAdminId = new mongoose.Types.ObjectId('000000000000000000000001')
      const existingClarezaJob = await CronJobConfig.findOne({ name: 'ClarezaRefresh' })
      if (!existingClarezaJob) {
        await CronJobConfig.create({
          name: 'ClarezaRefresh',
          description: 'Atualiza dados do Tremómetro Clareza 3×/dia via Financial Modeling Prep API',
          syncType: 'clareza',
          schedule: {
            cronExpression: '0 6,12,18 * * *',
            timezone: 'Europe/Lisbon',
            enabled: true
          },
          syncConfig: { fullSync: true, includeProgress: false, includeTags: false, batchSize: 200 },
          tagRules: [],
          tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
          notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: false, recipients: [] },
          retryPolicy: { maxRetries: 2, retryDelayMinutes: 30, exponentialBackoff: false },
          nextRun: new Date(),
          createdBy: systemCronAdminId,
          isActive: true,
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0
        })
        console.log('📈 [Clareza] Cron job ClarezaRefresh criado (6h, 12h, 18h Lisboa)')
        // Reinicializar para carregar o novo job
        await syncSchedulerService.initializeScheduler()
      } else {
        const fixedCronExpression = '0 6,12,18 * * *'
        const fixedTimezone = 'Europe/Lisbon'
        const needsScheduleRepair =
          existingClarezaJob.schedule.cronExpression !== fixedCronExpression ||
          existingClarezaJob.schedule.timezone !== fixedTimezone ||
          existingClarezaJob.schedule.enabled !== true ||
          existingClarezaJob.isActive !== true
        const missingCreatedBy = !(existingClarezaJob as any).createdBy

        if (needsScheduleRepair) {
          existingClarezaJob.set('schedule.cronExpression', fixedCronExpression)
          existingClarezaJob.set('schedule.timezone', fixedTimezone)
          existingClarezaJob.set('schedule.enabled', true)
          existingClarezaJob.set('isActive', true)
          console.log('📈 [Clareza] Schedule protegido reparado: 6h, 12h, 18h Lisboa')
        }

        if (missingCreatedBy) {
          existingClarezaJob.set('createdBy', systemCronAdminId)
          console.log('📈 [Clareza] Backfill aplicado: createdBy adicionado ao job existente')
        }

        if (needsScheduleRepair || missingCreatedBy) {
          await existingClarezaJob.save()
          await syncSchedulerService.initializeScheduler()
        }

        console.log('📈 [Clareza] Cron job ClarezaRefresh já existe — a ignorar seed')
      }
    } catch (error) {
      console.error('⚠️ [Clareza] Erro ao criar cron job seed:', error)
    }

    // ⏳ GURU TRIALS: Criar cron job diário (sync + marcar expirados) se não existir
    try {
      const CronJobConfig = (await import('./models/SyncModels/CronJobConfig')).default
      const systemCronAdminId = new mongoose.Types.ObjectId('000000000000000000000001')
      const existingTrialJob = await CronJobConfig.findOne({ name: 'GuruTrialCheck' })
      if (!existingTrialJob) {
        await CronJobConfig.create({
          name: 'GuruTrialCheck',
          description: 'Sincroniza trials Guru e MARCA os expirados (>7d sem conversão) PARA_INATIVAR. NÃO inativa — inativação é manual.',
          syncType: 'guru',
          schedule: {
            cronExpression: '0 7 * * *',  // 07:00 Lisboa, diário
            timezone: 'Europe/Lisbon',
            enabled: true
          },
          syncConfig: { fullSync: false, includeProgress: false, includeTags: false, batchSize: 200 },
          tagRules: [],
          tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
          notifications: { enabled: false, emailOnSuccess: false, emailOnFailure: false, recipients: [] },
          retryPolicy: { maxRetries: 2, retryDelayMinutes: 30, exponentialBackoff: false },
          nextRun: new Date(),
          createdBy: systemCronAdminId,
          isActive: true,
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0
        })
        console.log('⏳ [GuruTrials] Cron job GuruTrialCheck criado (07:00 Lisboa, diário)')
        await syncSchedulerService.initializeScheduler()
      } else {
        console.log('⏳ [GuruTrials] Cron job GuruTrialCheck já existe — a ignorar seed')
      }
    } catch (error) {
      console.error('⚠️ [GuruTrials] Erro ao criar cron job seed:', error)
    }

    // ✅ SPRINT 7: Iniciar System Monitor em produção
    if (process.env.NODE_ENV === 'production') {
      systemMonitor.start()
    }

    // 🔥 WARM-UP: Pré-aquecer cache em BACKGROUND (não bloquear servidor!)
    console.log('\n🔥 ============================================')
    console.log('🔥 Iniciando warm-up do cache em background...')
    console.log('🔥 ============================================\n')
    warmUpCache()
      .then(() => {
        console.log('\n✅ ============================================')
        console.log('✅ Cache pré-aquecido! Servidor 100% PRONTO.')
        console.log('✅ ============================================\n')

        // 📊 DASHBOARD STATS: Construir stats iniciais (DEPOIS do warm-up!)
        console.log('\n📊 ============================================')
        console.log('📊 Construindo Dashboard Stats iniciais...')
        console.log('📊 (Usando cache já aquecido)')
        console.log('📊 ============================================\n')
        return buildDashboardStats()
      })
      .then(() => {
        console.log('\n✅ ============================================')
        console.log('✅ Dashboard Stats iniciais construídos!')
        console.log('✅ ============================================\n')
      })
      .catch((err) => {
        console.error('❌ Erro no warm-up:', err)
      })
    

    // 📊 PRODUCT SALES: Iniciar CRON job se habilitado
    if (process.env.ENABLE_PRODUCT_SALES_CRON !== 'false') {
      // startRebuildProductSalesStatsJob()
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

// Middleware - CORS configurado para permitir frontend
const allowedOrigins = [
  'https://www.backoffice.serriquinho.com',
  'https://backoffice.serriquinho.com',
  'https://lp.serriquinho.com',
  'https://osriquinhos.serriquinho.com',
  'https://www.osriquinhos.serriquinho.com',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
]

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sem origin (ex: curl, Postman, mobile apps)
    if (!origin) return callback(null, true)

    if (allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      console.warn(`⚠️ CORS: Origem bloqueada: ${origin}`)
      // Em produção, bloquear. Em dev, permitir com warning
      if (process.env.NODE_ENV === 'production') {
        callback(new Error(`Origin ${origin} not allowed by CORS`))
      } else {
        callback(null, true) // Dev: permitir tudo
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'api_key', 'x-api-key']
}))
// gzip/brotli das respostas — corta ~10× o JSON pesado do Tremómetro/Top10
app.use(compression())
app.use(express.json())
app.use(metricsMiddleware)

// Rotas principais
app.use("/api", router)

// Analytics routes
app.use('/api/analytics/cohort', cohortAnalyticsRoutes)
app.use('/api/analytics/product-sales', productSalesStatsRoutes)
app.use('/api/business-analytics', businessAnalyticsRoutes)
app.use('/api/course-lessons', courseLessonsRoutes)

// System routes
app.use("/api/metrics", metricsRoutes)
app.use('/api', healthRoutes)

// Active Campaign routes
app.use('/api/activecampaign', activecampaignRoutes)
app.use('/api/webhooks', webhooksRoutes)

// Logs de validação (leitura para o backoffice) → /api/form/logs, /api/form/logs/stats
app.use('/api/form', validationLogsRoutes)

// Tag Rules (inline routes)
app.get('/api/tag-rules', getAllTagRules)
app.post('/api/tag-rules', createTagRule)
app.put('/api/tag-rules/:id', updateTagRule)
app.delete('/api/tag-rules/:id', deleteTagRule)

// Communication History
app.get('/api/communication-history', getCommunicationHistory)
app.use('/cron-tags', cronManagementRoutes)

// ⚠️ TEST ROUTES - APENAS DESENVOLVIMENTO
app.use('/api/test/history', testHistoryRoutes)

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
