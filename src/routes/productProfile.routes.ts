// ================================================================
// 📁 src/routes/productProfile.routes.ts
// ROTAS: Gestão de Perfis de Produto (Re-engagement)
// ================================================================

import { Router } from 'express'
import * as productProfileController from '../controllers/products/productProfile.controller'

const router = Router()

/**
 * @route   GET /api/product-profiles
 * @desc    Buscar todos os perfis de produto
 * @query   isActive=true/false (opcional)
 * @access  Private
 */
router.get('/', productProfileController.getAllProductProfiles)

/**
 * @route   GET /api/product-profiles/:code
 * @desc    Buscar perfil específico por código
 * @access  Private
 */
router.get('/:code', productProfileController.getProductProfileByCode)

/**
 * @route   GET /api/product-profiles/:code/stats
 * @desc    Obter estatísticas de um perfil
 * @access  Private
 */
router.get('/:code/stats', productProfileController.getProductProfileStats)

/**
 * @route   POST /api/product-profiles
 * @desc    Criar novo perfil de produto
 * @access  Private (Admin)
 */
router.post('/', productProfileController.createProductProfile)

/**
 * @route   POST /api/product-profiles/:code/duplicate
 * @desc    Duplicar perfil existente
 * @access  Private (Admin)
 */
router.post('/:code/duplicate', productProfileController.duplicateProductProfile)

/**
 * @route   PUT /api/product-profiles/:code
 * @desc    Atualizar perfil existente
 * @access  Private (Admin)
 */
router.put('/:code', productProfileController.updateProductProfile)

/**
 * @route   DELETE /api/product-profiles/:code
 * @desc    Deletar/desativar perfil
 * @query   hardDelete=true (opcional) para remover permanentemente
 * @access  Private (Admin)
 */
router.delete('/:code', productProfileController.deleteProductProfile)

export default router

