// src/routes/index.ts - VERSÃO CORRIGIDA COM 2 SISTEMAS CRON
import { Router } from "express"
import authRoutes from "./auth.routes"
import userRoutes from "./users.routes"
import hotmartRoutes from "./hotmart.routes"
import curseducaRoutes from './curseduca.routes'
import syncRoutes from "./sync.routes"
import classesRoutes from "./classes.routes"
import classManagementRoutes from "./classManagement.routes"
import testimonialRoutes from "./testimonials.routes"
import lessonsRoutes from "./lessons.routes"
import engagementRoutes from './engagement.routes'
import productsRoutes from './products.routes'
import analyticsRoutes from './analytics.routes'
import userHistoryRoutes from './userHistory.routes'
import courseRoutes from './course.routes'
import tagRuleRoutes from './ACroutes/tagRule.routes'
import dashboardRoutes from './dashboardRoutes'
import productProfileRoutes from './productProfile.routes'
import reengagementRoutes from './reengagement.routes'
import discoveryRoutes from './discovery.routes'
import acReaderRoutes from './ACroutes/acReader.routes'
import studentsRoutes from './students'
import tagMonitoringRoutes from './tagMonitoring.routes'
import tagEvaluationRoutes from './tagEvaluation.routes'
import guruRoutes from './guru.routes'

// ✅ CRON UTILIZADORES (Sistema Novo)
import cronRoutes from './syncUtilizadoresRoutes/cron.routes'
import syncStatsRoutes from './syncUtilizadoresRoutes/syncStats.routes'
import syncReports from './syncUtilizadoresRoutes/syncReports.routes'

// ✅ CRON TAGS (Sistema das Tags AC)
import cronManagementRoutes from './cron/cronManagement.routes'
import { estimateAffectedUsers, getAvailableFields, previewAffectedUsers } from "../controllers/acTags/tagRuleEstimate.controller"

const router = Router()

// 🔐 AUTENTICAÇÃO
router.use("/auth", authRoutes)

// 🔄 PRINCIPAIS SERVIÇOS DE SINCRONIZAÇÃO
router.use("/users", userRoutes)
router.use("/hotmart", hotmartRoutes)
router.use("/curseduca", curseducaRoutes)
router.use("/guru", guruRoutes)  // 💰 Integração Guru
router.use("/sync", syncRoutes)
router.use("/ac", acReaderRoutes) 

// 📚 GESTÃO DE TURMAS E CONTEÚDOS
router.use("/classes", classesRoutes)
router.use("/class-management", classManagementRoutes)
router.use("/lessons", lessonsRoutes)

// 👥 GESTÃO DE UTILIZADORES
router.use("/testimonials", testimonialRoutes)
router.use("/engagement", engagementRoutes)
router.use("/user-history", userHistoryRoutes)
router.use("/students", studentsRoutes)

// 📊 ANÁLISES E RELATÓRIOS
router.use("/dashboard", dashboardRoutes)
router.use("/products", productsRoutes)
router.use("/analytics", analyticsRoutes)

// 📧 ACTIVE CAMPAIGN & RE-ENGAGEMENT
router.use("/courses", courseRoutes)
router.post('/tag-rules/estimate', estimateAffectedUsers)
router.post('/tag-rules/preview', previewAffectedUsers)
router.get('/tag-rules/fields', getAvailableFields)
router.use("/tag-rules", tagRuleRoutes)

router.use("/product-profiles", productProfileRoutes)
router.use("/reengagement", reengagementRoutes)
router.use("/discovery", discoveryRoutes)

// ⏰ CRON SYSTEMS
// Sistema de CRON para sincronização de utilizadores
router.use('/cron', cronRoutes)                    // /api/cron/jobs, /api/cron/status
router.use('/sync', syncStatsRoutes)               // /api/sync/*
router.use('/sync/reports', syncReports)           // /api/sync/reports/*

// ✅ Sistema de CRON para gestão de Tags AC
router.use('/cron-tags', cronManagementRoutes)     // /api/cron-tags/config, /api/cron-tags/execute

// 🏷️ TAG MONITORING SYSTEM (Monitorização Semanal de Tags Nativas)
router.use('/tag-monitoring', tagMonitoringRoutes) // /api/tag-monitoring/*

// 🧪 TAG EVALUATION SYSTEM (Sistema de Teste de Tags V2)
router.use('/tags', tagEvaluationRoutes) // /api/tags/evaluate, /api/tags/evaluate-batch

// 🏥 HEALTH CHECK MELHORADO
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    services: {
      // Serviços principais
      users: "✅ Disponível",
      hotmart: "✅ Disponível",
      curseduca: "✅ Disponível",
      guru: "✅ Disponível",
      sync: "✅ Disponível",
      
      // Gestão de conteúdo
      classes: "✅ Disponível",
      classManagement: "✅ Disponível",
      lessons: "✅ Disponível",
      
      // Gestão de utilizadores
      testimonials: "✅ Disponível",
      engagement: "✅ Disponível",
      userHistory: "✅ Disponível",
      
      // Análises
      dashboard: "✅ Disponível (V1 & V2)",
      products: "✅ Disponível",
      analytics: "✅ Disponível",
      
      // Active Campaign
      courses: "✅ Disponível",
      tagRules: "✅ Disponível",
      
      // CRON Systems
      cronUtilizadores: "✅ Disponível",
      cronTags: "✅ Disponível",
      tagMonitoring: "✅ Disponível"
    },
    integrations: {
      hotmart: "✅ Configurado",
      curseduca: "✅ Configurado",
      guru: "✅ Configurado",
      activecampaign: "✅ Configurado",
      mongodb: "✅ Conectado"
    }
  })
})

// 🔗 ENDPOINT DE INFORMAÇÕES DO SISTEMA
router.get("/info", (req, res) => {
  res.status(200).json({
    name: "Sistema de Gestão de Utilizadores",
    version: "2.0.0",
    features: [
      "Sincronização Hotmart",
      "Sincronização CursEduca",
      "Progresso por plataforma",
      "Progresso combinado",
      "Cálculo de engagement",
      "Gestão de turmas",
      "Histórico de alterações",
      "Análises e relatórios",
      "Active Campaign Integration",
      "Tag Rules Engine",
      "CRON Utilizadores",
      "CRON Tags AC",
      "Tag Monitoring System"
    ],
    endpoints: {
      // Principais
      hotmart: "/api/hotmart",
      curseduca: "/api/curseduca",
      users: "/api/users",
      sync: "/api/sync",
      classes: "/api/classes",
      dashboard: "/api/dashboard",
      dashboardV2: "/api/dashboard/stats/v2",
      analytics: "/api/analytics",
      courses: "/api/courses",
      tagRules: "/api/tag-rules",
      
      // CRON Systems
      cronUtilizadores: "/api/cron/*",         // Sistema de jobs de utilizadores
      cronTags: "/api/cron-tags/*",            // Sistema de tags AC
      tagMonitoring: "/api/tag-monitoring/*"   // Monitorização de tags nativas
    }
  })
})

export default router