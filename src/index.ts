// ⚠️ CRITICAL: dotenv.config() MUST be the first thing executed!
import dotenv from "dotenv"
dotenv.config()

import express from "express"
import cors from "cors"
import mongoose from "mongoose" // <- aqui
import router from "./routes"

// ✅ SPRINT 7: Importar sistema de monitorização
import metricsMiddleware from "./middleware/metrics.middleware"
import metricsRoutes from "./routes/metrics.routes"
import systemMonitor from "./services/systemMonitor.service"

// ✅ ACTIVE CAMPAIGN: Importar CRON job e rotas
import './jobs/evaluateRules.job'
import activecampaignRoutes from './routes/activecampaign.routes'
import webhooksRoutes from './routes/webhooks.routes'
import healthRoutes from './routes/health.routes'
import cronManagementRoutes from './routes/cronManagement.routes'
import cronManagementService from './services/cronManagement.service'

// ✅ ACTIVE CAMPAIGN: Importar controllers para Tag Rules e Communication History
import {
  getAllTagRules,
  createTagRule,
  updateTagRule,
  deleteTagRule,
  getCommunicationHistory
} from './controllers/activecampaign.controller'

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

// Verificar se os modelos foram importados corretamente
import "./models"

// Importar inicializador de CRON jobs
import jobScheduler from "./jobs"

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

    // ✅ CRON MANAGEMENT: Inicializar CRON jobs de gestão
    try {
      await cronManagementService.initializeCronJobs()
      console.log("✅ CRON Management iniciado com sucesso")
    } catch (error) {
      console.error("⚠️ Erro ao inicializar CRON Management:", error)
    }

    // ✅ SPRINT 7: Iniciar System Monitor em produção
    if (process.env.NODE_ENV === 'production') {
      systemMonitor.start()
    }
  })
  .catch((err) => {
    console.error("❌ Erro ao ligar ao MongoDB:", err)
    process.exit(1) // Encerra a app se falhar
  })

app.use(cors())
app.use(express.json())

// ✅ SPRINT 7: Adicionar middleware de métricas
app.use(metricsMiddleware)

// Rotas principais
app.use("/api", router)

// ✅ SPRINT 7: Rotas de métricas
app.use("/api/metrics", metricsRoutes)

// ✅ ACTIVE CAMPAIGN: Rotas de AC, webhooks e health
app.use('/api/activecampaign', activecampaignRoutes)
app.use('/api/webhooks', webhooksRoutes)
app.use('/api', healthRoutes)

// ✅ CRON MANAGEMENT: Rotas de gestão de CRON jobs
app.use('/api/cron', cronManagementRoutes)

// ✅ ACTIVE CAMPAIGN: Rotas de Tag Rules (courses já estão em course.routes.ts)
// Tag Rules
app.get('/api/tag-rules', getAllTagRules)
app.post('/api/tag-rules', createTagRule)
app.put('/api/tag-rules/:id', updateTagRule)
app.delete('/api/tag-rules/:id', deleteTagRule)

// Communication History
app.get('/api/communication-history', getCommunicationHistory)

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado em http://localhost:${PORT}/api`)
  console.log(`📊 Métricas: http://localhost:${PORT}/api/metrics`)
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`)
  console.log(`📧 Active Campaign: http://localhost:${PORT}/api/activecampaign`)
  console.log(`🕐 CRON Management: http://localhost:${PORT}/api/cron`)
})

// ✅ SPRINT 7: Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📥 SIGTERM recebido. Encerrando graciosamente...')
  systemMonitor.stop()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('📥 SIGINT recebido. Encerrando graciosamente...')
  systemMonitor.stop()
  process.exit(0)
})
