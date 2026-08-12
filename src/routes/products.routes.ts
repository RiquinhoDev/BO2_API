// ════════════════════════════════════════════════════════════
// 📁 src/routes/products.routes.ts
// ROTAS DE PRODUTOS - SUPERFÍCIE CANÓNICA ÚNICA
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'

// Leituras auxiliares do domínio de produtos
import {
    getEngagementStats,
  getProductUsers 
} from '../controllers/products/products.controller'

// Product Controller
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductStudents,
  getProductAnalytics
} from '../controllers/products/product.controller'

const router = Router()

// GET /api/products
router.get('/', asyncRoute(getAllProducts))

// GET /api/products/engagement-stats - Stats de engagement
router.get('/engagement-stats', asyncRoute(getEngagementStats))

// GET /api/products/users - Lista de users (para Products Tab)
router.get('/users', asyncRoute(getProductUsers))

// ═══════════════════════════════════════════════════════════
// ROTAS DE ESCRITA E DETALHE
// ═══════════════════════════════════════════════════════════

// CRUD básico
router.post('/', asyncRoute(createProduct))           // Criar produto
router.put('/:id', asyncRoute(updateProduct))         // Atualizar produto
router.delete('/:id', asyncRoute(deleteProduct))      // Soft delete produto

// Analytics e dados
router.get('/:id', asyncRoute(getProductById))        // Get produto por ID
router.get('/:id/students', asyncRoute(getProductStudents))  // Estudantes do produto
router.get('/:id/analytics', asyncRoute(getProductAnalytics)) // Analytics do produto

export default router