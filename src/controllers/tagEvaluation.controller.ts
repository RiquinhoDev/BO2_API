// ════════════════════════════════════════════════════════════
// 📁 src/controllers/tagEvaluation.controller.ts
// Controller para teste e avaliação do sistema de tags V2
// ════════════════════════════════════════════════════════════

import { Request, Response } from 'express'
import mongoose from 'mongoose'
import User from '../models/user'
import { UserProduct } from '../models'
import Product from '../models/product/Product'
import { evaluateStudentTags, getTagsToAdd, getTagsToRemove } from '../jobs/dailyPipeline/tagEvaluation/evaluateStudentTags'
import { evaluateGlobalUserTags } from '../jobs/dailyPipeline/tagEvaluation/globalUserTags'
import {
  IUserForEvaluation,
  IUserProductForEvaluation,
  IProductForEvaluation,
  ITagEvaluationResult
} from '../jobs/dailyPipeline/tagEvaluation/types'

// ═══════════════════════════════════════════════════════════
// INTERFACES
// ═══════════════════════════════════════════════════════════

interface EvaluateTagsRequest {
  userId?: string
  email?: string
  productId?: string
  dryRun?: boolean
  updateLocalDB?: boolean
  verbose?: boolean
  includeDebugInfo?: boolean
}

interface TagDiff {
  currentTags: string[]
  newTags: string[]
  tagsToAdd: string[]
  tagsToRemove: string[]
  unchanged: string[]
}

interface UserEvaluationResult {
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
    debug?: any
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
function mapUserToEvaluation(user: any): IUserForEvaluation {
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
function mapUserProductToEvaluation(userProduct: any): IUserProductForEvaluation {
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
function mapProductToEvaluation(product: any): IProductForEvaluation {
  return {
    _id: product._id,
    name: product.name,
    code: product.code
  }
}

/**
 * Calcula diferença entre tags atuais e novas
 */
function calculateTagDiff(currentTags: string[], newTags: string[]): TagDiff {
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

// ═══════════════════════════════════════════════════════════
// ENDPOINTS
// ═══════════════════════════════════════════════════════════

/**
 * POST /api/tags/evaluate
 *
 * Avalia tags para um ou mais utilizadores SEM tocar no ActiveCampaign
 *
 * Body:
 * {
 *   userId?: string,           // ID do user (ou email)
 *   email?: string,            // Email do user
 *   productId?: string,        // Avaliar apenas este produto
 *   dryRun?: boolean,          // true = não atualiza nada (default: true)
 *   updateLocalDB?: boolean,   // true = atualiza UserProduct.activeCampaignData.tags (default: false)
 *   verbose?: boolean,         // true = logs detalhados (default: false)
 *   includeDebugInfo?: boolean // true = info debug (default: true)
 * }
 *
 * Returns:
 * {
 *   success: boolean,
 *   users: UserEvaluationResult[],
 *   summary: {...},
 *   errors: string[]
 * }
 */
export const evaluateTags = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now()

  try {
    const {
      userId,
      email,
      productId,
      dryRun = true,
      updateLocalDB = false,
      verbose = false,
      includeDebugInfo = true
    } = req.body as EvaluateTagsRequest

    // ═══════════════════════════════════════════════════════════
    // 1. VALIDAÇÃO
    // ═══════════════════════════════════════════════════════════

    if (!userId && !email) {
      res.status(400).json({
        success: false,
        error: 'userId ou email é obrigatório'
      })
      return
    }

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR USER
    // ═══════════════════════════════════════════════════════════

    const query: any = {}
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        res.status(400).json({
          success: false,
          error: 'userId inválido'
        })
        return
      }
      query._id = new mongoose.Types.ObjectId(userId)
    } else if (email) {
      query.email = email
    }

    const user = await User.findOne(query).lean()

    if (!user) {
      res.status(404).json({
        success: false,
        error: 'Utilizador não encontrado'
      })
      return
    }

    if (verbose) {
      console.log(`\n📧 Avaliando tags para: ${user.email}`)
    }

    // ═══════════════════════════════════════════════════════════
    // 3. BUSCAR USERPRODUCTS
    // ═══════════════════════════════════════════════════════════

    const userProductsQuery: any = { userId: user._id }
    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        res.status(400).json({
          success: false,
          error: 'productId inválido'
        })
        return
      }
      userProductsQuery.productId = new mongoose.Types.ObjectId(productId)
    }

    const userProducts = await UserProduct.find(userProductsQuery).lean()

    if (userProducts.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Nenhum produto encontrado para este utilizador'
      })
      return
    }

    if (verbose) {
      console.log(`📦 Produtos encontrados: ${userProducts.length}`)
    }

    // ═══════════════════════════════════════════════════════════
    // 4. BUSCAR PRODUTOS
    // ═══════════════════════════════════════════════════════════

    const productIds = userProducts.map(up => up.productId)
    const products = await Product.find({ _id: { $in: productIds } }).lean()

    const productsMap = new Map<string, IProductForEvaluation>()
    products.forEach(p => {
      productsMap.set(p._id.toString(), mapProductToEvaluation(p))
    })

    // ═══════════════════════════════════════════════════════════
    // 5. AVALIAR TAGS POR PRODUTO
    // ═══════════════════════════════════════════════════════════

    const userEvaluation = mapUserToEvaluation(user)
    const productResults: UserEvaluationResult['products'] = []

    let totalCurrentTags = 0
    let totalNewTags = 0
    let totalToAdd = 0
    let totalToRemove = 0

    for (const userProduct of userProducts) {
      const product = productsMap.get(userProduct.productId.toString())

      if (!product) {
        if (verbose) {
          console.warn(`⚠️  Produto ${userProduct.productId} não encontrado`)
        }
        continue
      }

      // Converter para formato de avaliação
      const upForEval = mapUserProductToEvaluation(userProduct)

      // Avaliar tags
      const result = await evaluateStudentTags(
        userEvaluation,
        [upForEval],
        productsMap,
        { verbose, includeDebugInfo }
      )

      // Tags atuais (da BD)
      const currentTags = userProduct.activeCampaignData?.tags || []

      // Calcular diff
      const diff = calculateTagDiff(currentTags, result.tags)

      productResults.push({
        productId: product._id.toString(),
        productName: product.name,
        status: userProduct.status,
        currentTags,
        newTags: result.tags,
        diff,
        appliedTags: result.appliedTags,
        debug: includeDebugInfo ? result.debug : undefined
      })

      totalCurrentTags += currentTags.length
      totalNewTags += result.tags.length
      totalToAdd += diff.tagsToAdd.length
      totalToRemove += diff.tagsToRemove.length

      if (verbose) {
        console.log(`\n  📦 ${product.name}:`)
        console.log(`     Status: ${userProduct.status}`)
        console.log(`     Tags atuais: ${currentTags.length}`)
        console.log(`     Tags novas: ${result.tags.length}`)
        console.log(`     ➕ A adicionar: ${diff.tagsToAdd.length}`)
        console.log(`     ➖ A remover: ${diff.tagsToRemove.length}`)
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 6. AVALIAR TAGS GLOBAIS
    // ═══════════════════════════════════════════════════════════

    const globalTags = evaluateGlobalUserTags(
      userProducts.map(up => mapUserProductToEvaluation(up))
    )

    if (verbose && globalTags.length > 0) {
      console.log(`\n🌍 Tags globais: ${globalTags.join(', ')}`)
    }

    // ═══════════════════════════════════════════════════════════
    // 7. ATUALIZAR BD LOCAL (SE SOLICITADO)
    // ═══════════════════════════════════════════════════════════

    const warnings: string[] = []

    if (updateLocalDB && !dryRun) {
      if (verbose) {
        console.log('\n💾 Atualizando BD local (UserProduct.activeCampaignData.tags)...')
      }

      for (const result of productResults) {
        await UserProduct.updateOne(
          {
            userId: user._id,
            productId: new mongoose.Types.ObjectId(result.productId)
          },
          {
            $set: {
              'activeCampaignData.tags': result.newTags,
              'activeCampaignData.lastEvaluatedAt': new Date()
            }
          }
        )
      }

      if (verbose) {
        console.log('✅ BD local atualizada')
      }
    } else if (updateLocalDB && dryRun) {
      warnings.push('updateLocalDB ignorado porque dryRun=true')
    }

    // ═══════════════════════════════════════════════════════════
    // 8. RESPOSTA
    // ═══════════════════════════════════════════════════════════

    const duration = Date.now() - startTime

    const response = {
      success: true,
      dryRun,
      updatedLocalDB: updateLocalDB && !dryRun,
      user: {
        userId: user._id.toString(),
        email: user.email,
        name: user.name,
        products: productResults,
        globalTags,
        summary: {
          totalProducts: productResults.length,
          totalCurrentTags,
          totalNewTags,
          totalToAdd,
          totalToRemove
        }
      },
      warnings: warnings.length > 0 ? warnings : undefined,
      meta: {
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }
    }

    if (verbose) {
      console.log('\n' + '═'.repeat(60))
      console.log('✅ Avaliação concluída')
      console.log(`⏱️  Duração: ${duration}ms`)
      console.log('═'.repeat(60) + '\n')
    }

    res.status(200).json(response)

  } catch (error: any) {
    console.error('❌ Erro ao avaliar tags:', error)
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * POST /api/tags/evaluate-batch
 *
 * Avalia tags para múltiplos utilizadores
 *
 * Body:
 * {
 *   userIds?: string[],        // IDs dos users
 *   emails?: string[],         // Emails dos users
 *   limit?: number,            // Limitar número de users (default: 10)
 *   ...outras opções
 * }
 */
export const evaluateTagsBatch = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now()

  try {
    const {
      userIds,
      emails,
      limit = 10,
      dryRun = true,
      updateLocalDB = false,
      verbose = false,
      includeDebugInfo = false
    } = req.body

    // ═══════════════════════════════════════════════════════════
    // 1. VALIDAÇÃO
    // ═══════════════════════════════════════════════════════════

    if (!userIds && !emails) {
      res.status(400).json({
        success: false,
        error: 'userIds ou emails é obrigatório'
      })
      return
    }

    if (limit > 100) {
      res.status(400).json({
        success: false,
        error: 'Limite máximo: 100 utilizadores'
      })
      return
    }

    // ═══════════════════════════════════════════════════════════
    // 2. BUSCAR USERS
    // ═══════════════════════════════════════════════════════════

    const query: any = {}
    if (userIds) {
      query._id = { $in: userIds.map((id: string) => new mongoose.Types.ObjectId(id)) }
    } else if (emails) {
      query.email = { $in: emails }
    }

    const users = await User.find(query).limit(limit).lean()

    if (users.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Nenhum utilizador encontrado'
      })
      return
    }

    console.log(`\n📧 Avaliando ${users.length} utilizadores...`)

    // ═══════════════════════════════════════════════════════════
    // 3. PROCESSAR CADA USER
    // ═══════════════════════════════════════════════════════════

    const results: any[] = []
    const errors: Array<{ email: string; error: string }> = []

    for (const user of users) {
      try {
        // Simular request individual
        const individualReq = {
          body: {
            userId: user._id.toString(),
            dryRun,
            updateLocalDB,
            verbose: false, // Desativar verbose individual
            includeDebugInfo
          }
        } as Request

        const individualRes = {
          status: (code: number) => ({
            json: (data: any) => {
              if (data.success) {
                results.push(data.user)
              } else {
                errors.push({ email: user.email, error: data.error })
              }
            }
          })
        } as any

        await evaluateTags(individualReq, individualRes)

      } catch (error: any) {
        errors.push({ email: user.email, error: error.message })
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 4. RESPOSTA
    // ═══════════════════════════════════════════════════════════

    const duration = Date.now() - startTime

    const totalToAdd = results.reduce((sum, r) => sum + r.summary.totalToAdd, 0)
    const totalToRemove = results.reduce((sum, r) => sum + r.summary.totalToRemove, 0)

    res.status(200).json({
      success: true,
      dryRun,
      updatedLocalDB: updateLocalDB && !dryRun,
      results,
      summary: {
        totalUsers: users.length,
        processed: results.length,
        errors: errors.length,
        totalTagsToAdd: totalToAdd,
        totalTagsToRemove: totalToRemove
      },
      errors: errors.length > 0 ? errors : undefined,
      meta: {
        duration: `${duration}ms`,
        timestamp: new Date().toISOString()
      }
    })

    console.log(`✅ Avaliação batch concluída: ${results.length}/${users.length} users (${duration}ms)`)

  } catch (error: any) {
    console.error('❌ Erro ao avaliar tags em batch:', error)
    res.status(500).json({
      success: false,
      error: error.message
    })
  }
}

export default {
  evaluateTags,
  evaluateTagsBatch
}
