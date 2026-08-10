// ================================================================
// 📁 src/routes/productProfile.routes.ts
// ROTAS: Gestão de Perfis de Produto (Re-engagement)
// ================================================================

import { Router } from 'express'
import { asyncRoute } from '../security/asyncRoute'
import * as productProfileController from '../controllers/products/productProfile.controller'
import { productProfilesDeleteInput } from '../security/productProfilesDestructiveInput'
import { withValidatedInput } from '../security/validatedInput'

const router = Router()

/**
 * @route   GET /api/product-profiles
 * @desc    Buscar todos os perfis de produto
 * @query   isActive=true/false (opcional)
 * @access  Private
 */
router.get('/', asyncRoute(productProfileController.getAllProductProfiles))

/**
 * @route   GET /api/product-profiles/:code
 * @desc    Buscar perfil específico por código
 * @access  Private
 */
router.get('/:code', asyncRoute(productProfileController.getProductProfileByCode))

/**
 * @route   GET /api/product-profiles/:code/stats
 * @desc    Obter estatísticas de um perfil
 * @access  Private
 */
router.get('/:code/stats', asyncRoute(productProfileController.getProductProfileStats))

/**
 * @route   POST /api/product-profiles
 * @desc    Criar novo perfil de produto
 * @access  Private (Admin)
 */
router.post('/', asyncRoute(productProfileController.createProductProfile))

/**
 * @route   POST /api/product-profiles/:code/duplicate
 * @desc    Duplicar perfil existente
 * @access  Private (Admin)
 */
router.post('/:code/duplicate', asyncRoute(productProfileController.duplicateProductProfile))

/**
 * @route   PUT /api/product-profiles/:code
 * @desc    Atualizar perfil existente
 * @access  Private (Admin)
 */
router.put('/:code', asyncRoute(productProfileController.updateProductProfile))

/**
 * @route   DELETE /api/product-profiles/:code
 * @desc    Deletar/desativar perfil
 * @query   hardDelete=true (opcional) para remover permanentemente
 * @access  Private (Admin)
 */
router.delete(
  '/:code',
  withValidatedInput(productProfilesDeleteInput, (input, _req, res, next) =>
    productProfileController.deleteProductProfile(input, res, next)),
)

export default router
