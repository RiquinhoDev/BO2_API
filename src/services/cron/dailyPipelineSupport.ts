import type mongoose from 'mongoose'
import { Product } from '../../models'
import logger from '../../utils/logger'

export type PipelineUser = {
  _id: mongoose.Types.ObjectId
  hotmart?: {
    lastAccessDate?: Date
    firstAccessDate?: Date
    progress?: { lastAccessDate?: Date }
  }
  metadata?: { purchaseDate?: Date }
}

export type PipelineProduct = {
  _id: mongoose.Types.ObjectId
  code?: string
}

export type PipelineUserProduct = {
  userId: PipelineUser | null
  productId: PipelineProduct | null
  metadata?: { purchaseDate?: Date }
}

export function hasPipelineReferences(
  userProduct: PipelineUserProduct
): userProduct is PipelineUserProduct & { userId: PipelineUser; productId: PipelineProduct } {
  return Boolean(userProduct.userId?._id && userProduct.productId?._id)
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CONFIGURATION
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Obter configuraÃ§Ã£o dos produtos para sync (DINÃ‚MICO DA BD)
 */
export async function getProductsConfig() {
  const hotmartProducts = await Product.find({ 
    platform: 'hotmart', 
    isActive: true 
  }).select('code platformData').lean()
  
  const curseducaProducts = await Product.find({ 
    platform: 'curseduca', 
    isActive: true 
  }).select('code platformData').lean()
  
  return {
    hotmart: {
      products: hotmartProducts
    },
    curseduca: {
      products: curseducaProducts
    }
  }
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// MAIN PIPELINE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

/**
 * Helper para logging limpo (sem spam)
 */
export function logStep(stepNum: number, stepName: string, status: 'START' | 'DONE' | 'ERROR', stats?: string) {
  const timestamp = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })

  if (status === 'START') {
    logger.info(`[${timestamp}] STEP ${stepNum}/6: ${stepName}...`)
  } else if (status === 'DONE') {
    const statsStr = stats ? ` (${stats})` : ''
    logger.info(`[${timestamp}] STEP ${stepNum}/6: ${stepName} âœ“${statsStr}`)
  } else {
    logger.error(`[${timestamp}] STEP ${stepNum}/6: ${stepName} âœ— ${stats}`)
  }
}
