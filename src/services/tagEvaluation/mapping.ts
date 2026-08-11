import { getTagsToAdd, getTagsToRemove } from '../../jobs/dailyPipeline/tagEvaluation/evaluateStudentTags'
import {
  IUserForEvaluation,
  IUserProductForEvaluation,
  IProductForEvaluation,
  ITagEvaluationResult
} from '../../jobs/dailyPipeline/tagEvaluation/types'
export interface EvaluateTagsRequest {
  userId?: string
  email?: string
  productId?: string
  dryRun?: boolean
  updateLocalDB?: boolean
  verbose?: boolean
  includeDebugInfo?: boolean
}

export interface TagDiff {
  currentTags: string[]
  newTags: string[]
  tagsToAdd: string[]
  tagsToRemove: string[]
  unchanged: string[]
}

export interface UserEvaluationResult {
  userId: string
  email: string
  name?: string
  products: Array<{
    productId: string
    productName: string
    status: string
    currentTags: string[]
    newTags: string[]
    diff: TagDiff
    appliedTags: ITagEvaluationResult['appliedTags']
    debug?: ITagEvaluationResult['debug']
  }>
  globalTags: string[]
  summary: {
    totalProducts: number
    totalCurrentTags: number
    totalNewTags: number
    totalToAdd: number
    totalToRemove: number
  }
}

// ═══════════════════════════════════════════════════════════
// FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════

/**
 * Converte User para IUserForEvaluation
 */
export function mapUserToEvaluation(user: Readonly<IUserForEvaluation>): IUserForEvaluation {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    inactivation: user.inactivation
  }
}

/**
 * Converte UserProduct para IUserProductForEvaluation
 */
export function mapUserProductToEvaluation(userProduct: Readonly<IUserProductForEvaluation>): IUserProductForEvaluation {
  return {
    _id: userProduct._id,
    userId: userProduct.userId,
    productId: userProduct.productId,
    status: userProduct.status,
    engagement: userProduct.engagement,
    progress: userProduct.progress,
    activeCampaignData: userProduct.activeCampaignData,
    metadata: userProduct.metadata,
    curseduca: userProduct.curseduca,
    reactivatedAt: userProduct.reactivatedAt,
    createdAt: userProduct.createdAt,
    updatedAt: userProduct.updatedAt
  }
}

/**
 * Converte Product para IProductForEvaluation
 */
export function mapProductToEvaluation(product: Readonly<IProductForEvaluation>): IProductForEvaluation {
  return {
    _id: product._id,
    name: product.name,
    code: product.code
  }
}

/**
 * Calcula diferença entre tags atuais e novas
 */
export function calculateTagDiff(currentTags: string[], newTags: string[]): TagDiff {
  const toAdd = getTagsToAdd(currentTags, newTags)
  const toRemove = getTagsToRemove(currentTags, newTags)
  const unchanged = currentTags.filter(tag => newTags.includes(tag))

  return {
    currentTags,
    newTags,
    tagsToAdd: toAdd,
    tagsToRemove: toRemove,
    unchanged
  }
}
