import type mongoose from 'mongoose'
import { Product, TagRule, User, UserProduct } from '../../models'
import logger from '../../utils/logger'
import { HttpError } from '../../security/errorHandling'
import { MAX_PROVIDER_READ_ITEMS } from '../../security/providerReadBatchPolicy'

export const DAILY_PIPELINE_MAX_ITEMS = MAX_PROVIDER_READ_ITEMS
export const DAILY_PIPELINE_MAX_PRODUCTS = DAILY_PIPELINE_MAX_ITEMS

export class DailyPipelineCapacityError extends HttpError {
  constructor(observed: number) {
    super({
      status: 413,
      code: 'SYNC_PIPELINE_CAP_EXCEEDED',
      publicMessage: `Pipeline limitado a ${DAILY_PIPELINE_MAX_ITEMS} itens; detetados ${observed}`,
    })
  }
}

export function assertDailyPipelinePayloadCapacity(observed: number): void {
  if (observed > DAILY_PIPELINE_MAX_ITEMS) throw new DailyPipelineCapacityError(observed)
}

type DailyPipelineConfig = {
  hotmart: { products: readonly unknown[] }
  curseduca: { products: readonly unknown[] }
}

export function configuredProductCount(config: DailyPipelineConfig): number {
  return config.hotmart.products.length + config.curseduca.products.length
}

export function assertDailyPipelineConfigCapacity(config: DailyPipelineConfig): void {
  assertDailyPipelinePayloadCapacity(configuredProductCount(config))
}

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
  }).select('code platformData').limit(DAILY_PIPELINE_MAX_PRODUCTS + 1).lean()
  
  const curseducaProducts = await Product.find({ 
    platform: 'curseduca', 
    isActive: true 
  }).select('code platformData').limit(DAILY_PIPELINE_MAX_PRODUCTS + 1).lean()
  
  return {
    hotmart: {
      products: hotmartProducts
    },
    curseduca: {
      products: curseducaProducts
    }
  }
}

export async function getDailyPipelinePlan() {
  const config = await getProductsConfig()
  const [activeUserProducts, testimonialUsers, activeTagRules] = await Promise.all([
    UserProduct.countDocuments({ status: 'ACTIVE' }),
    User.countDocuments({
      'communicationByCourse.TESTIMONIALS.currentTags': { $exists: true, $ne: [] },
    }),
    TagRule.countDocuments({ isActive: true }),
  ])
  const configuredProducts = {
    hotmart: config.hotmart.products.length,
    curseduca: config.curseduca.products.length,
  }
  const observed = Math.max(
    activeUserProducts,
    testimonialUsers,
    activeTagRules,
    configuredProductCount(config),
  )

  return {
    config,
    plan: {
      operation: 'daily-pipeline' as const,
      dryRun: true as const,
      limit: DAILY_PIPELINE_MAX_ITEMS,
      withinLimit: observed <= DAILY_PIPELINE_MAX_ITEMS,
      activeUserProducts,
      testimonialUsers,
      activeTagRules,
      configuredProducts,
      steps: [
        'syncHotmart',
        'syncCursEduca',
        'preCreateTags',
        'recalcEngagement',
        'evaluateTagRules',
        'syncTestimonialTags',
      ] as const,
    },
  }
}

export function assertDailyPipelineCapacity(plan: {
  withinLimit: boolean
  activeUserProducts: number
  testimonialUsers: number
  activeTagRules: number
  configuredProducts?: { hotmart: number; curseduca: number }
}): void {
  if (plan.withinLimit) return
  throw new DailyPipelineCapacityError(Math.max(
    plan.activeUserProducts,
    plan.testimonialUsers,
    plan.activeTagRules,
    (plan.configuredProducts?.hotmart ?? 0) + (plan.configuredProducts?.curseduca ?? 0),
  ))
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
