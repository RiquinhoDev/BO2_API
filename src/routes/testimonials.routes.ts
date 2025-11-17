// src/routes/testimonials.routes.ts
import { Router } from 'express'
import {
  getTestimonialStats,
  listTestimonials,
  createTestimonial,
  createTestimonialRequest,
  updateTestimonialStatus,
  deleteTestimonial,
  getAvailableStudents,
  getTestimonialReport,
  getBestCandidates,
  getStudentTestimonials
} from '../controllers/testimonials.controller'

const router = Router()

// 📊 ESTATÍSTICAS
// GET /api/testimonials/stats - Estatísticas gerais dos testemunhos
router.get('/stats', getTestimonialStats)

// 📋 LISTAGEM E FILTROS
// GET /api/testimonials - Lista testemunhos com filtros e paginação
router.get('/', listTestimonials)

// 👥 ESTUDANTES DISPONÍVEIS
// GET /api/testimonials/available-students - Busca estudantes disponíveis para testemunho
router.get('/available-students', getAvailableStudents)

// 🎯 MELHORES CANDIDATOS
// GET /api/testimonials/best-candidates - Busca melhores candidatos baseado em métricas
router.get('/best-candidates', getBestCandidates)

// GET /api/testimonials/student - Busca testemunhos de um estudante específico
router.get('/student', getStudentTestimonials)

// 📊 RELATÓRIOS
// GET /api/testimonials/report - Relatório detalhado com gráficos
router.get('/report', getTestimonialReport)

// ➕ CRIAR TESTEMUNHOS
// POST /api/testimonials - Criar novo testemunho individual
router.post('/', createTestimonial)

// POST /api/testimonials/request - Criar solicitação de testemunho para múltiplos estudantes
router.post('/request', createTestimonialRequest)

// ✏️ ATUALIZAR TESTEMUNHO
// PUT /api/testimonials/:id - Atualizar status e detalhes do testemunho
router.put('/:id', updateTestimonialStatus)

// 🗑️ REMOVER TESTEMUNHO
// DELETE /api/testimonials/:id - Remover testemunho
router.delete('/:id', deleteTestimonial)

export default router


// =======================================
// ADICIONAR AO ARQUIVO src/routes/index.ts
// =======================================

/*
Para integrar as rotas de testemunhos ao sistema principal, 
adicione as seguintes linhas ao arquivo src/routes/index.ts:

import testimonialRoutes from "./testimonials.routes"

// Depois, dentro da função principal:
router.use("/testimonials", testimonialRoutes)

// E no health check, adicione:
testimonials: "✅ Disponível"
*/