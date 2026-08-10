// ════════════════════════════════════════════════════════════
// 📁 src/routes/products.routes.ts
// ROTAS DE PRODUTOS - SUPORTA V1 (LEGACY) E V2 (NOVO)
// ════════════════════════════════════════════════════════════

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'

// V1 - Legacy controllers (compatibilidade)
import { 
  getProducts as getLegacyProducts, 
  getProductById as getLegacyProductById, 
  getEngagementStats,
  getProductUsers 
} from '../controllers/products/products.controller'

// V2 - Novo Product Controller
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

// ═══════════════════════════════════════════════════════════
// ROTAS LEGACY (V1) - MANTIDAS PARA COMPATIBILIDADE
// ═══════════════════════════════════════════════════════════

// GET /api/products?legacy=true - Formato antigo
router.get('/', asyncRoute(getAllProducts))  // Suporta legacy=true query param

// GET /api/products/engagement-stats - Stats de engagement
router.get('/engagement-stats', asyncRoute(getEngagementStats))

// GET /api/products/users - Lista de users (para Products Tab)
router.get('/users', asyncRoute(getProductUsers))

// ═══════════════════════════════════════════════════════════
// ROTAS V2 - NOVOS ENDPOINTS
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