import type { Types } from 'mongoose'
import type { IUser } from '../../../models/user'
import type { IUserProduct } from '../../../models/UserProduct'
import type { IProduct } from '../../../models/product/Product'
import { Product, UserProduct } from '../../../models'
import type { UniversalSourceItem, UniversalSyncType } from '../../../types/universalSync.types'
import logger from '../../../utils/logger'
import { calculateEngagementMetricsForUserProduct, type EngagementMetricsResult } from './engagement/engagementMetrics'
import { buildUserProductCreatePlan, buildUserProductUpdatePlan, planPrimaryReassignment } from './builders/userProductMutationPlan'
import { debugLog } from './debugLog'
import { errorMessage, toDateOrNull } from './fieldUtils'
import { productsCache, type LeanProduct } from './productsCache'
import type { CronExecutionPhaseHooks } from '../../cron/scheduler/executionPhases'

export type PersistUserProductResult =
  | { status: 'completed'; userProduct?: IUserProduct }
  | { status: 'missing-product' }
  | { status: 'failed' }

interface PersistUserProductInput {
  item: UniversalSourceItem
  syncType: UniversalSyncType
  user: IUser
  userId: string
  phaseHooks?: CronExecutionPhaseHooks
  plannedUserProducts?: Record<string, unknown>[]
}

export const buildUserProductOptimisticFilter = (existing: Record<string, unknown>): Record<string, unknown> => {
  const filter: Record<string, unknown> = {
    _id: existing._id,
    userId: existing.userId,
    productId: existing.productId,
  }
  if (existing.updatedAt) filter.updatedAt = existing.updatedAt
  else filter.status = existing.status
  return filter
}

async function determineProductId(
  item: UniversalSourceItem,
  syncType: UniversalSyncType,
): Promise<Types.ObjectId | null> {
  const useCache = productsCache.isLoaded()

  if (syncType === 'hotmart') {
    const productCode = item.productCode || 'OGI_V1'

    if (useCache) {
      const cached = productsCache.get(`hotmart:${productCode}`) || productsCache.get(productCode)
      if (cached) {
        debugLog(`✅ [ProductMapping] Produto Hotmart do cache: ${productCode}`)
        return cached._id
      }
      logger.warn(`⚠️ [ProductMapping] Produto Hotmart fora do snapshot: ${productCode}`)
      return null
    }

    const product = await Product.findOne({
      code: productCode,
      platform: 'hotmart',
      isActive: true,
    }).select('_id').lean<LeanProduct>()

    if (!product) {
      logger.warn(`⚠️ [ProductMapping] Produto Hotmart não encontrado: ${productCode}`)
    }

    return product?._id || null
  }

  if (syncType === 'curseduca') {
    const groupId = String(item.groupId || '')

    if (groupId) {
      if (useCache) {
        const cached = productsCache.get(`group_${groupId}`)
        if (cached) {
          debugLog(`✅ [ProductMapping] Produto CursEduca do cache (groupId ${groupId}): ${cached.code}`)
          return cached._id
        }
      }

      const product = await Product.findOne({
        platform: 'curseduca',
        curseducaGroupId: groupId,
        isActive: true,
      }).select('_id code').lean<LeanProduct>()

      if (product) {
        debugLog(`✅ [ProductMapping] Produto encontrado por groupId ${groupId}: ${product.code}`)
        return product._id
      }
    }

    if (item.subscriptionType) {
      const productCode =
        item.subscriptionType === 'MONTHLY'
          ? 'CLAREZA_MENSAL'
          : item.subscriptionType === 'ANNUAL'
            ? 'CLAREZA_ANUAL'
            : null

      if (productCode) {
        if (useCache) {
          const cached = productsCache.get(productCode)
          if (cached) {
            debugLog(`✅ [ProductMapping] Produto do cache (subscriptionType): ${productCode}`)
            return cached._id
          }
        }

        const product = await Product.findOne({
          platform: 'curseduca',
          code: productCode,
          isActive: true,
        }).select('_id code').lean<LeanProduct>()

        if (product) {
          debugLog(
            `✅ [ProductMapping] Produto encontrado por subscriptionType ${item.subscriptionType}: ${product.code}`,
          )
          return product._id
        }

        logger.warn(
          `⚠️ [ProductMapping] Produto não encontrado para subscriptionType: ${item.subscriptionType} (${productCode})`,
        )
      }
    }

    if (item.groupName) {
      const product = await Product.findOne({
        platform: 'curseduca',
        name: { $regex: new RegExp(item.groupName, 'i') },
        isActive: true,
      }).select('_id code').lean<LeanProduct>()

      if (product) {
        logger.info(`✅ [ProductMapping] Produto encontrado por groupName "${item.groupName}": ${product.code}`)
        return product._id
      }
    }

    if (useCache) {
      const cachedDefault = Array.from(productsCache.values()).find(
        (product) => product.platform === 'curseduca',
      )
      if (cachedDefault) {
        logger.warn(
          `⚠️ [ProductMapping] Usando produto default CursEDuca: ${cachedDefault.code} (groupId: ${groupId})`,
        )
        return cachedDefault._id
      }
    }

    const defaultProduct = await Product.findOne({
      platform: 'curseduca',
      isActive: true,
    }).select('_id code').lean<LeanProduct>()

    if (defaultProduct) {
      logger.warn(
        `⚠️ [ProductMapping] Usando produto default CursEDuca: ${defaultProduct.code} (groupId: ${groupId})`,
      )
      return defaultProduct._id
    }

    logger.error('❌ [ProductMapping] Nenhum produto CursEDuca ativo encontrado!')
  }

  return null
}

async function calculateMetrics(
  user: IUser,
  productId: Types.ObjectId,
  plannedProduct?: LeanProduct,
): Promise<EngagementMetricsResult | null> {
  try {
    const product = plannedProduct ?? await Product.findById(productId)
    return product
      ? calculateEngagementMetricsForUserProduct(user, product as unknown as IProduct)
      : null
  } catch (error: unknown) {
    logger.error(`   ❌ [Sprint 1.5B] Erro ao calcular engagement metrics: ${errorMessage(error)}`)
    return null
  }
}

export async function persistUserProduct(
  input: PersistUserProductInput,
): Promise<PersistUserProductResult> {
  const { item, syncType, user, userId } = input

  try {
    const productId = await determineProductId(item, syncType)

    if (!productId) {
      logger.warn(`⚠️ [UniversalSync] Produto não encontrado para ${syncType} - user: ${user.email}`)
      return { status: 'missing-product' }
    }

    const existing = input.plannedUserProducts
      ? input.plannedUserProducts.find((row) =>
        String(row.userId ?? '') === userId && String(row.productId ?? '') === String(productId),
      ) as unknown as IUserProduct | undefined
      : await UserProduct.findOne({ userId, productId })

    if (existing) {
      const metrics = await calculateMetrics(user, productId, productsCache.findById(productId))
      const plan = buildUserProductUpdatePlan({
        item,
        syncType,
        existing: {
          progressPercentage: existing.progress?.percentage,
          engagementScore: existing.engagement?.engagementScore,
          classes: existing.classes || [],
        },
        metrics,
        clock: { now: () => new Date() },
      })

      if (plan.classAddedId) {
        logger.info(`   📚 [Classes] Adicionada turma ${plan.classAddedId} para ${user.email}`)
      }
      if (plan.needsUpdate) {
        input.phaseHooks?.assertOwnership?.()
        input.phaseHooks?.localMutationStarted()
        input.phaseHooks?.consumeMutation?.()
        const optimisticFilter = buildUserProductOptimisticFilter(existing as unknown as Record<string, unknown>)
        const updated = await UserProduct.findOneAndUpdate(optimisticFilter, { $set: plan.fields }, { new: true })
        if (!updated && input.phaseHooks) throw new Error('HOTMART_SYNC_PLAN_CONCURRENCY_CONFLICT')
        debugLog(`   📦 UserProduct atualizado: ${user.email}`)
        return { status: 'completed', userProduct: updated ?? existing }
      }

      return { status: 'completed' }
    }

    const enrolledAt =
      toDateOrNull(item.enrolledAt) ||
      toDateOrNull(item.purchaseDate) ||
      toDateOrNull(item.joinedDate) ||
      new Date()

    let isPrimary = item.platformData?.isPrimary ?? true
    if (syncType === 'curseduca' && isPrimary) {
      const existingPrimary = await UserProduct.findOne({
        userId,
        platform: 'curseduca',
        productId: { $ne: productId },
        isPrimary: true,
      })

      if (existingPrimary) {
        logger.info(`   🛡️ [Proteção] User ${item.email} já tem produto PRIMARY`)
        const reassignment = planPrimaryReassignment(
          { enrolledAt: existingPrimary.enrolledAt, status: existingPrimary.status },
          enrolledAt,
          { now: () => new Date() },
        )
        isPrimary = reassignment.newIsPrimary

        if (reassignment.demoteUpdate) {
          logger.info('      ✅ Novo produto mais recente → PRIMARY, antigo → INACTIVE')
          input.phaseHooks?.assertOwnership?.()
          input.phaseHooks?.localMutationStarted()
          input.phaseHooks?.consumeMutation?.()
          await UserProduct.updateOne(
            { _id: existingPrimary._id },
            { $set: reassignment.demoteUpdate },
          )
        } else {
          logger.info('      🔻 Novo produto mais antigo → SECONDARY (antigo mantém-se PRIMARY)')
        }
      }
    }

    const metrics = await calculateMetrics(user, productId, productsCache.findById(productId))
    const newUserProduct = buildUserProductCreatePlan({
      item,
      syncType,
      userId,
      productId,
      enrolledAt,
      isPrimary,
      metrics,
      clock: { now: () => new Date() },
    })

    input.phaseHooks?.assertOwnership?.()
    input.phaseHooks?.localMutationStarted()
    input.phaseHooks?.consumeMutation?.()
    const created = await UserProduct.create(newUserProduct)
    debugLog(`   ✨ UserProduct CRIADO: ${user.email} → ${syncType}`)
    return { status: 'completed', userProduct: created }
  } catch (error: unknown) {
    if (input.phaseHooks) throw error
    logger.error(
      `❌ [UniversalSync] Erro ao criar/atualizar UserProduct para ${user.email}: ${errorMessage(error)}`,
    )
    return { status: 'failed' }
  }
}
