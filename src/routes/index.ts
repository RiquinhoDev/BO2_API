// src/routes/index.ts - VERSÃO CORRIGIDA COM CURSEDUCA + DASHBOARD V2 + V2 ROUTES
import { Router } from "express"
import userRoutes from "./users.routes"
import hotmartRoutes from "./hotmart.routes"
import curseducaRoutes from './curseduca.routes'  // Sincronização CursEduca
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
import tagRuleRoutes from './tagRule.routes'
import dashboardRoutes from './dashboardRoutes'  // Dashboard V1 & V2 (Sprint Correções)
import productProfileRoutes from './productProfile.routes'  // Re-engagement Profiles
import reengagementRoutes from './reengagement.routes'  // Re-engagement System
import discoveryRoutes from './discovery.routes'  // Discovery System
import acReaderRoutes from './acReader.routes'  // Sprint 5: Contact Tag Reader (OLD)
import contactTagReaderRoutes from './contactTagReader.routes'  // Sprint 5: Contact Tag Reader (NEW)

// 🎯 SPRINT 5.2 - V2 ROUTES (Arquitetura Escalável)
import usersV2Routes from './usersV2.routes'
import syncV2Routes from './syncV2.routes'

import activecampaignV2Routes from './activecampaignV2.routes'
   import cronRoutes from './syncUtilizadoresRoutes/cron.routes'
   import syncStatsRoutes from './syncUtilizadoresRoutes/syncStats.routes'
      import syncReports from './syncUtilizadoresRoutes/syncReports.routes'
const router = Router()

// 🔄 PRINCIPAIS SERVIÇOS DE SINCRONIZAÇÃO
router.use("/users", userRoutes)
router.use("/hotmart", hotmartRoutes)      // Sincronização Hotmart
router.use("/curseduca", curseducaRoutes)  // Sincronização CursEduca
router.use("/sync", syncRoutes)            // Histórico de sincronizações

// 🎯 V2 ROUTES - Arquitetura Escalável (Sprint 5.2)
router.use("/v2/users", usersV2Routes)
router.use("/v2/sync", syncV2Routes)

router.use("/v2/activecampaign", activecampaignV2Routes)

// 📚 GESTÃO DE TURMAS E CONTEÚDOS
router.use("/classes", classesRoutes)
router.use("/class-management", classManagementRoutes)
router.use("/lessons", lessonsRoutes)

// 👥 GESTÃO DE UTILIZADORES
router.use("/testimonials", testimonialRoutes)
router.use("/engagement", engagementRoutes)
router.use("/user-history", userHistoryRoutes)

// 📊 ANÁLISES E RELATÓRIOS
router.use("/dashboard", dashboardRoutes)  // Dashboard V1 & V2 (Sprint Correções)
router.use("/products", productsRoutes)
router.use("/analytics", analyticsRoutes)

// 📧 ACTIVE CAMPAIGN & RE-ENGAGEMENT
router.use("/courses", courseRoutes)
router.use("/tag-rules", tagRuleRoutes)
router.use("/product-profiles", productProfileRoutes)
router.use("/reengagement", reengagementRoutes)
router.use("/discovery", discoveryRoutes)
router.use("/ac", acReaderRoutes)  // Sprint 5: Contact Tag Reader (OLD)
router.use("/ac", contactTagReaderRoutes)  // Sprint 5: Contact Tag Reader (NEW - Improved)
// src/routes/index.ts

   router.use('/cron', cronRoutes)
router.use('/sync', syncStatsRoutes)
 router.use('/sync/reports', syncReports)     


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
      curseduca: "✅ Disponível",  // Nova integração
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
      dashboard: "✅ Disponível (V1 & V2)",  // Sprint Correções
      products: "✅ Disponível",
      analytics: "✅ Disponível",
      
      // Active Campaign
      courses: "✅ Disponível",
      tagRules: "✅ Disponível"
    },
    integrations: {
      hotmart: "✅ Configurado",
      curseduca: "✅ Configurado",
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
      "Tag Rules Engine"
    ],
    endpoints: {
      hotmart: "/api/hotmart",
      curseduca: "/api/curseduca",
      users: "/api/users",
      sync: "/api/sync",
      classes: "/api/classes",
      dashboard: "/api/dashboard",      // Sprint Correções
      dashboardV2: "/api/dashboard/stats/v2",  // Sprint Correções
      analytics: "/api/analytics",
      courses: "/api/courses",
      tagRules: "/api/tag-rules"
    }
  })
})

export default router