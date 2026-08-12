// ══════════════════════════════════════════════════════════════════════
// 📁 src/controllers/tagEvaluation.controller.ts
// Controller para teste e avaliação do sistema de tags V2
// ══════════════════════════════════════════════════════════════════════

import logger from '../utils/logger'
import { NextFunction, Request, Response } from 'express'
import mongoose from 'mongoose'
import User from '../models/user'
import { UserProduct } from '../models'
import Product from '../models/product/Product'
import { forwardApplicationError } from '../security/forwardApplicationError'
import { successResponse, type SuccessResponse } from '../contracts/responseContract'
import { evaluateStudentTags } from '../jobs/dailyPipeline/tagEvaluation/evaluateStudentTags'
import { evaluateGlobalUserTags } from '../jobs/dailyPipeline/tagEvaluation/globalUserTags'
import { IProductForEvaluation } from '../jobs/dailyPipeline/tagEvaluation/types'
import {
  calculateTagDiff,
  EvaluateTagsRequest,
  mapProductToEvaluation,
  mapUserProductToEvaluation,
  mapUserToEvaluation,
  UserEvaluationResult
} from '../services/tagEvaluation/mapping'

interface EvaluateTagsRequestLike {
  body: EvaluateTagsRequest
}

type EvaluateTagsSuccessBody = SuccessResponse<
  { user: UserEvaluationResult } & Record<string, unknown>,
  Record<string, unknown>
>

type EvaluateTagsDirectSuccessBody = {
  success: true
  user: UserEvaluationResult
} & Record<string, unknown>

type EvaluateTagsErrorBody = {
  success: false
  error: string
}

type EvaluateTagsJsonBody =
  | EvaluateTagsSuccessBody
  | EvaluateTagsDirectSuccessBody
  | EvaluateTagsErrorBody

interface EvaluateTagsResponseLike {
  status(code: number): {
    json(data: EvaluateTagsJsonBody): unknown
  }
}

/**
 * POST /api/tags/evaluate
 * Avalia tags para um ou mais utilizadores SEM tocar no ActiveCampaign.
 */
export const evaluateTags = async (
  req: EvaluateTagsRequestLike,
  res: EvaluateTagsResponseLike,
  next: NextFunction
): Promise<void> => {
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
    } = req.body

    if (!userId && !email) {
      res.status(400).json({
        success: false,
        error: 'userId ou email é obrigatório'
      })
      return
    }

    const query: { _id?: mongoose.Types.ObjectId; email?: string } = {}
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
      logger.info(`\n📧 Avaliando tags para: ${user.email}`)
    }

    const userProductsQuery: {
      userId: mongoose.Types.ObjectId
      productId?: mongoose.Types.ObjectId
    } = { userId: user._id }

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
      logger.info(`📦 Produtos encontrados: ${userProducts.length}`)
    }

    const productIds = userProducts.map(up => up.productId)
    const products = await Product.find({ _id: { $in: productIds } }).lean()

    const productsMap = new Map<string, IProductForEvaluation>()
    products.forEach(p => {
      productsMap.set(p._id.toString(), mapProductToEvaluation(p))
    })

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
          logger.warn(`Produto ${userProduct.productId} nao encontrado`)
        }
        continue
      }

      const upForEval = mapUserProductToEvaluation(userProduct)

      const result = await evaluateStudentTags(
        userEvaluation,
        [upForEval],
        productsMap,
        { verbose, includeDebugInfo }
      )

      const currentTags = userProduct.activeCampaignData?.tags || []
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
        logger.info(`\n  📦 ${product.name}:`)
        logger.info(`     Status: ${userProduct.status}`)
        logger.info(`     Tags atuais: ${currentTags.length}`)
        logger.info(`     Tags novas: ${result.tags.length}`)
        logger.info(`     ➕ A adicionar: ${diff.tagsToAdd.length}`)
        logger.info(`     ➖ A remover: ${diff.tagsToRemove.length}`)
      }
    }

    const globalTags = evaluateGlobalUserTags(
      userProducts.map(up => mapUserProductToEvaluation(up))
    )

    if (verbose && globalTags.length > 0) {
      logger.info(`\n🌍 Tags globais: ${globalTags.join(', ')}`)
    }

    const warnings: string[] = []

    if (updateLocalDB && !dryRun) {
      if (verbose) {
        logger.info('\n💾 Atualizando BD local (UserProduct.activeCampaignData.tags)...')
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
        logger.info('✅ BD local atualizada')
      }
    } else if (updateLocalDB && dryRun) {
      warnings.push('updateLocalDB ignorado porque dryRun=true')
    }

    const duration = Date.now() - startTime

    const response = {
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
      logger.info('\n' + '═'.repeat(60))
      logger.info('✅ Avaliação concluída')
      logger.info(`⏱️  Duração: ${duration}ms`)
      logger.info('═'.repeat(60) + '\n')
    }

    res.status(200).json(successResponse(response, {
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }))

  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao avaliar tags', 'TAG_EVALUATION_FAILED')
  }
}

/**
 * POST /api/tags/evaluate-batch
 * Avalia tags para múltiplos utilizadores.
 */
export const evaluateTagsBatch = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const startTime = Date.now()

  try {
    const {
      userIds,
      emails,
      limit = 10,
      dryRun = true,
      updateLocalDB = false,
      includeDebugInfo = false
    } = req.body

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

    const query: {
      _id?: { $in: mongoose.Types.ObjectId[] }
      email?: { $in: string[] }
    } = {}

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

    logger.info(`\n📧 Avaliando ${users.length} utilizadores...`)

    const results: UserEvaluationResult[] = []
    const errors: Array<{ email: string; error: string }> = []

    for (const user of users) {
      try {
        const individualReq: EvaluateTagsRequestLike = {
          body: {
            userId: user._id.toString(),
            dryRun,
            updateLocalDB,
            verbose: false,
            includeDebugInfo
          }
        }

        const individualRes: EvaluateTagsResponseLike = {
          status: (_code: number) => ({
            json: (data: EvaluateTagsJsonBody) => {
              if (data.success) {
                const payload = 'data' in data ? data.data : data
                results.push(payload.user)
              } else {
                errors.push({ email: user.email, error: data.error })
              }
            }
          })
        }

        await evaluateTags(individualReq, individualRes, (error: unknown) => { throw error })

      } catch {
        errors.push({ email: user.email, error: 'Erro ao avaliar tags' })
      }
    }

    const duration = Date.now() - startTime

    const totalToAdd = results.reduce((sum, r) => sum + r.summary.totalToAdd, 0)
    const totalToRemove = results.reduce((sum, r) => sum + r.summary.totalToRemove, 0)

    res.status(200).json(successResponse({
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
      errors: errors.length > 0 ? errors : undefined
    }, {
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    }))

    logger.info(`✅ Avaliação batch concluída: ${results.length}/${users.length} users (${duration}ms)`)

  } catch (error: unknown) {
    forwardApplicationError(next, error, 'Erro ao avaliar tags em batch', 'TAG_EVALUATION_BATCH_FAILED')
  }
}

export default {
  evaluateTags,
  evaluateTagsBatch
}
