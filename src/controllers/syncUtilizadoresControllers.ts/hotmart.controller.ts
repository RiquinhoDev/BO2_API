// src/controllers/hotmart.controller.ts
// ✅ UNIFICADO: hotmart.controller.ts + hotmartV2.controller.ts + Universal Sync endpoints

import { Request, Response } from 'express'
import axios from 'axios'
import type { Types } from 'mongoose'
import { Class, Product, SyncHistory, User } from '../../models'
import { getUserCountForProduct, getUsersByProduct } from '../../services/userProductService'
import { ensureUserHistoryModel } from '../../models/UserHistory'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'
import hotmartAdapter from '../../services/syncUtilziadoresServices/hotmartServices/hotmart.adapter'
import universalSyncService, { SyncError, SyncProgress, SyncWarning } from '../../services/syncUtilziadoresServices/universalSyncService'


// ─────────────────────────────────────────────────────────────
// V2 - PRODUCTS / USERS BY PRODUCT
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/hotmart/v2/products
 * Lista todos os produtos Hotmart
 */
export const getHotmartProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'hotmart' })
      .select('name code platformData isActive')
      .lean()

    res.json({
      success: true,
      data: products,
      count: products.length,
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

/**
 * GET /api/hotmart/v2/products/:subdomain
 * Busca produto Hotmart específico por subdomain
 */
type LeanHotmartProduct = {
  _id: Types.ObjectId
  name?: string
  platformData?: { subdomain?: string }
} & Record<string, unknown>

export const getHotmartProductBySubdomain = async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params

    const product = await Product.findOne({
      platform: 'hotmart',
      'platformData.subdomain': subdomain
    })
      .lean<LeanHotmartProduct>()
      .exec()

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}`
      })
    }

    const userCount = await getUserCountForProduct(product._id.toString())

    return res.json({
      success: true,
      data: { ...product, userCount },
      _v2Enabled: true
    })
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message })
  }
}


/**
 * GET /api/hotmart/v2/products/:subdomain/users
 * Lista users de um produto Hotmart específico
 */
export const getHotmartProductUsers = async (req: Request, res: Response) => {
  try {
    const { subdomain } = req.params
    const { status, minProgress } = req.query

    const product = await Product.findOne({
      platform: 'hotmart',
      'platformData.subdomain': subdomain
    })

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Produto Hotmart não encontrado para subdomain: ${subdomain}`
      })
    }

    let users = await getUsersByProduct(product._id.toString())

    if (status) {
      users = users.filter(u =>
        u.products.some((p: any) =>
          p.product._id.toString() === product._id.toString() &&
          p.platformSpecificData?.hotmart?.status === status
        )
      )
    }

    if (minProgress) {
      const minProg = parseInt(minProgress as string, 10)
      users = users.filter(u =>
        u.products.some((p: any) =>
          p.product._id.toString() === product._id.toString() &&
          (p.progress?.progressPercentage || 0) >= minProg
        )
      )
    }

    res.json({
      success: true,
      data: users,
      count: users.length,
      filters: { status, minProgress },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

/**
 * GET /api/hotmart/v2/stats
 * Estatísticas gerais dos produtos Hotmart
 */
export const getHotmartStats = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'hotmart' }).lean()

    const stats = await Promise.all(
      products.map(async (product) => {
        const users = await getUsersByProduct(String(product._id))

        return {
          productId: product._id,
          productName: product.name,
          subdomain: product.platformData?.subdomain,
          totalUsers: users.length,
          activeUsers: users.filter(u =>
            u.products.some((p: any) =>
              p.product._id.toString() === (String(product._id)) &&
              p.platformSpecificData?.hotmart?.status === 'active'
            )
          ).length
        }
      })
    )

    res.json({
      success: true,
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsers: stats.reduce((sum, s) => sum + s.totalUsers, 0),
        totalActiveUsers: stats.reduce((sum, s) => sum + s.activeUsers, 0)
      },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}


interface HotmartLesson {
  page_id: string
  page_name: string
  module_name: string
  is_module_extra: boolean
  is_completed: boolean
  completed_date?: number
}

async function getHotmartAccessToken(): Promise<string> {
  try {
    const clientId = process.env.HOTMART_CLIENT_ID
    const clientSecret = process.env.HOTMART_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios')
    }

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
    console.log(`🔐 Gerando token com Basic Auth para client_id: ${clientId.substring(0, 10)}...`)

    const response = await axios.post(
      'https://api-sec-vlc.hotmart.com/security/oauth/token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${basicAuth}`
        }
      }
    )

    if (!response.data.access_token) {
      throw new Error('Access token não encontrado na resposta')
    }

    console.log(`✅ Token obtido com sucesso - Expira em: ${response.data.expires_in} segundos`)
    return response.data.access_token
  } catch (error: any) {
    console.error('❌ Erro detalhado ao obter token Hotmart:')
    console.error('📊 Status:', error.response?.status)
    console.error('📄 Resposta:', error.response?.data)
    console.error('🔗 URL:', error.config?.url)
    throw new Error(
      `Falha ao obter token de acesso da Hotmart: ${error.response?.data?.error_description || error.message}`
    )
  }
}

const fetchUserLessons = async (userId: string, accessToken: string): Promise<HotmartLesson[]> => {
  try {
    const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk'
    console.log(`🔍 Buscando lições do utilizador ${userId}`)

    const response = await axios.get(
      `https://developers.hotmart.com/club/api/v1/users/${userId}/lessons?subdomain=${subdomain}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log(`📚 Resposta da API:`, {
      hasLessons: 'lessons' in response.data,
      lessonsCount: response.data.lessons?.length || 0
    })

    return response.data.lessons || []
  } catch (error: any) {
    console.error(`❌ Erro ao buscar lições do utilizador ${userId}:`, error.response?.data || error.message)
    return []
  }
}

const calculateProgress = (lessons: HotmartLesson[]) => {
  if (lessons.length === 0) {
    return { completedPercentage: 0, total: 0, completed: 0, lessons: [] as any[] }
  }

  const completed = lessons.filter(lesson => lesson.is_completed).length
  const total = lessons.length
  const completedPercentage = Math.round((completed / total) * 100)

  return {
    completedPercentage,
    total,
    completed,
    lessons: lessons.map(lesson => ({
      pageId: lesson.page_id,
      pageName: lesson.page_name,
      moduleName: lesson.module_name,
      isModuleExtra: lesson.is_module_extra,
      isCompleted: lesson.is_completed,
      completedDate: lesson.completed_date ? new Date(lesson.completed_date) : undefined
    }))
  }
}

function convertUnixTimestamp(timestamp: any): Date | null {
  if (!timestamp) return null

  if (typeof timestamp === 'string' && timestamp.includes('T') && timestamp.includes('Z')) {
    const date = new Date(timestamp)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      if (year < 2000 || year > 2030) {
        console.warn(`Data ISO inválida detectada: ${timestamp} (ano: ${year}). Retornando null.`)
        return null
      }
      return date
    }
    return null
  }

  const numTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
  if (isNaN(numTimestamp) || numTimestamp <= 0) return null

  const timestampMs = numTimestamp < 1e12 ? numTimestamp * 1000 : numTimestamp
  const date = new Date(timestampMs)

  const year = date.getFullYear()
  if (year < 2000 || year > 2030) {
    console.warn(
      `Data suspeita detectada: ${date.toISOString()} (timestamp: ${timestamp}). Retornando null para evitar dados inválidos.`
    )
    return null
  }

  return date
}

// ✅ SYNC COMPLETO (legacy)
export const syncHotmartUsers = async (req: Request, res: Response): Promise<void> => {
  let syncRecord: any = null

  try {
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        includeProgress: true,
        includeLessons: true,
        includeEngagement: true,
        syncType: 'complete_with_progress_classes_engagement'
      }
    })

    console.log(`🚀 [${syncRecord._id}] Iniciando sincronização Hotmart com pré-cálculo de engagement...`)

    const accessToken = await getHotmartAccessToken()

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      'metadata.currentStep': 'Token de acesso obtido',
      'metadata.progress': 10
    })

    let allUsers: any[] = []
    let nextPageToken: string | null = null
    let pageCount = 0
    const batchSize = 50

    do {
      pageCount++

      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': `Buscando utilizadores - Página ${pageCount}`,
        'metadata.progress': 10 + (pageCount * 2)
      })

      const subdomain = process.env.subdomain || 'ograndeinvestimento-bomrmk'
      let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`
      if (nextPageToken) requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`

      console.log(`🔗 [${syncRecord._id}] Requisição: ${requestUrl}`)

      const response = await axios.get(requestUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      console.log(`📋 [${syncRecord._id}] Estrutura da resposta:`, Object.keys(response.data))

      const users = response.data.users || response.data.items || response.data.data || []
      const pageInfo = response.data.page_info || response.data.pageInfo || response.data.pagination || {}

      if (!Array.isArray(users)) {
        throw new Error(`Resposta inválida da API: esperado array, recebido ${typeof users}`)
      }

      allUsers = allUsers.concat(users)
      nextPageToken = pageInfo.next_page_token || pageInfo.nextPageToken || null

      console.log(`📄 [${syncRecord._id}] Página ${pageCount}: ${users.length} utilizadores`)
      await new Promise(resolve => setTimeout(resolve, 200))

    } while (nextPageToken)

    console.log(`📊 [${syncRecord._id}] Total encontrados: ${allUsers.length}`)

    if (allUsers.length === 0) throw new Error('Nenhum utilizador encontrado na API da Hotmart')

    let totalProcessed = 0
    let totalWithProgress = 0
    let totalWithClasses = 0
    let totalWithEngagement = 0
    let totalInserted = 0
    let totalUpdated = 0
    let totalErrors = 0
    const errors: string[] = []

    const uniqueClassIds = new Set<string>()

    for (let i = 0; i < allUsers.length; i += batchSize) {
      const batch = allUsers.slice(i, i + batchSize)
      const bulkOperations: any[] = []

      const progressPercentage = 50 + ((i / allUsers.length) * 45)
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        'metadata.currentStep': `Processando utilizadores ${i + 1}-${Math.min(i + batchSize, allUsers.length)}`,
        'metadata.progress': progressPercentage,
        'metadata.processed': totalProcessed,
        'metadata.withProgress': totalWithProgress,
        'metadata.withClasses': totalWithClasses,
        'metadata.withEngagement': totalWithEngagement
      })

      for (const apiUser of batch) {
        try {
          if (!apiUser.email || !apiUser.email.trim()) {
            totalErrors++
            errors.push(`Utilizador sem email válido: ${JSON.stringify(apiUser)}`)
            continue
          }
          if (!apiUser.name || !apiUser.name.trim()) {
            totalErrors++
            errors.push(`Utilizador sem nome válido: ${apiUser.email}`)
            continue
          }

          const hotmartId = apiUser.id || apiUser.user_id || apiUser.uid || apiUser.code
          if (!hotmartId) {
            totalErrors++
            errors.push(`Utilizador sem ID Hotmart: ${apiUser.email}`)
            continue
          }

          const existingUser = await User.findOne({ email: apiUser.email.toLowerCase().trim() })
          console.log(`🔍 [${syncRecord._id}] Verificando utilizador: ${apiUser.email}`)
          console.log(`   • Utilizador existente: ${!!existingUser}`)
          if (existingUser) {
            console.log(`   • Tem CursEduca: ${!!existingUser.curseduca?.curseducaUserId}`)
            console.log(`   • Tem Hotmart: ${!!existingUser.hotmart?.hotmartUserId}`)
          }

          const userClassId = apiUser.class_id || null
          if (userClassId) {
            uniqueClassIds.add(userClassId)
            totalWithClasses++
            console.log(`🎓 [${syncRecord._id}] Turma encontrada: ${apiUser.email} → ${userClassId}`)
          }

          let progressData = {
            completedPercentage: 0,
            total: 0,
            completed: 0,
            lessons: [] as any[],
            lastUpdated: new Date()
          }

          try {
            const userLessons = await fetchUserLessons(hotmartId, accessToken)
            if (userLessons.length > 0) {
              const calculated = calculateProgress(userLessons)
              progressData = {
                completedPercentage: calculated.completedPercentage,
                total: calculated.total,
                completed: calculated.completed,
                lessons: calculated.lessons,
                lastUpdated: new Date()
              }
              totalWithProgress++
            }
          } catch (progressError) {
            console.warn(`⚠️ [${syncRecord._id}] Erro ao buscar progresso de ${apiUser.email}:`, progressError)
          }

          const normalizedEmail = apiUser.email.trim().toLowerCase()

          bulkOperations.push({
            updateOne: {
              filter: { email: normalizedEmail },
              update: {
                $set: {
                  email: normalizedEmail,
                  name: apiUser.name.trim(),

                  'hotmart.hotmartUserId': hotmartId,
                  'hotmart.purchaseDate': convertUnixTimestamp(apiUser.purchase_date),
                  'hotmart.signupDate': convertUnixTimestamp(apiUser.signup_date) || new Date(),
                  'hotmart.plusAccess': apiUser.plus_access || 'WITHOUT_PLUS_ACCESS',
                  'hotmart.firstAccessDate': convertUnixTimestamp(apiUser.first_access_date),

                  'hotmart.enrolledClasses': userClassId ? [{
                    classId: userClassId,
                    className: `Turma ${userClassId}`,
                    source: 'hotmart',
                    isActive: true,
                    enrolledAt: convertUnixTimestamp(apiUser.purchase_date) || new Date()
                  }] : [],

                  'hotmart.progress': {
                    totalTimeMinutes: 0,
                    completedLessons: progressData.completed,
                    lessonsData: progressData.lessons.map((l: any) => ({
                      lessonId: l.pageId,
                      title: l.pageName,
                      completed: l.isCompleted,
                      completedAt: l.completedDate,
                      timeSpent: 0
                    })),
                    lastAccessDate: convertUnixTimestamp(apiUser.last_access_date)
                  },

                  'hotmart.engagement': {
                    accessCount: Number(apiUser.access_count) || 0,
                    engagementLevel: apiUser.engagement || 'NONE',
                    engagementScore: 0,
                    calculatedAt: new Date()
                  },

                  'hotmart.lastSyncAt': new Date(),
                  'hotmart.syncVersion': '2.0',

                  'metadata.updatedAt': new Date(),
                  'metadata.sources.hotmart.lastSync': new Date(),
                  'metadata.sources.hotmart.version': '2.0'
                }
              },
              upsert: true
            }
          })

          totalProcessed++

        } catch (userError: any) {
          totalErrors++
          errors.push(`Erro ao processar ${apiUser.email || 'email_desconhecido'}: ${userError.message}`)
        }

        await new Promise(resolve => setTimeout(resolve, 50))
      }

      try {
        if (bulkOperations.length > 0) {
          const UserHistoryModel = ensureUserHistoryModel()

          const emails = bulkOperations.map(op => op.updateOne?.filter?.email).filter(Boolean)
          const existingUsers = await User.find({ email: { $in: emails } })
            .select('email hotmart.enrolledClasses combined.classId combined.className')
            .lean()

          const existingUsersMap = new Map(existingUsers.map((u: any) => [u.email, u]))
          const historyOperations: any[] = []

          for (const operation of bulkOperations) {
            const email = operation.updateOne?.filter?.email
            const newSet = operation.updateOne?.update?.$set
            if (!email || !newSet) continue

            const existing = existingUsersMap.get(email)
            if (!existing) continue

            const prevClassId = existing?.hotmart?.enrolledClasses?.[0]?.classId || existing?.combined?.classId
            const nextClassId = newSet?.['hotmart.enrolledClasses']?.[0]?.classId

            if (nextClassId && prevClassId !== nextClassId) {
              historyOperations.push({
                insertOne: {
                  document: {
                    userId: existing._id,
                    userEmail: email,
                    changeType: 'CLASS_CHANGE',
                    previousValue: { classId: prevClassId, className: existing?.combined?.className },
                    newValue: { classId: nextClassId, className: `Turma ${nextClassId}` },
                    changeDate: new Date(),
                    source: 'HOTMART_SYNC',
                    syncId: syncRecord._id,
                    reason: 'Mudança de turma detectada na sincronização da Hotmart'
                  }
                }
              })
            }
          }

          if (historyOperations.length > 0) {
            try {
              await UserHistoryModel.bulkWrite(historyOperations, { ordered: false })
            } catch (historyError) {
              console.error(`❌ [${syncRecord._id}] Erro ao criar histórico:`, historyError)
            }
          }

          const result = await User.bulkWrite(bulkOperations, { ordered: false })
          totalInserted += result.upsertedCount || 0
          totalUpdated += result.modifiedCount || 0

          const batchEmails = bulkOperations.map(op => op.updateOne.filter.email)
          let successfulEngagement = 0
          const engagementErrors: string[] = []

          try {
            const batchUsers = await User.find(
              { email: { $in: batchEmails } },
              { _id: 1, email: 1, 'hotmart.engagement': 1, 'hotmart.progress': 1 }
            ).lean() as any[]

            for (const u of batchUsers) {
              try {
                const hotmartEngagement = u.hotmart?.engagement?.engagementLevel || 'NONE'
                const hotmartAccessCount = u.hotmart?.engagement?.accessCount || 0
                const hotmartProgress = u.hotmart?.progress || {}

                const engagementResult = calculateCombinedEngagement({
                  engagement: hotmartEngagement,
                  accessCount: hotmartAccessCount,
                  progress: hotmartProgress
                })

                await User.findByIdAndUpdate(u._id, {
                  'hotmart.engagement.engagementScore': engagementResult.score,
                  'hotmart.engagement.engagementLevel': engagementResult.level,
                  'hotmart.engagement.calculatedAt': new Date()
                })

                successfulEngagement++
              } catch (engagementError: any) {
                engagementErrors.push(`Erro engagement ${u.email || 'unknown'}: ${engagementError.message}`)
              }

              await new Promise(resolve => setTimeout(resolve, 10))
            }
          } catch (batchEngagementError: any) {
            engagementErrors.push(`Erro geral: ${batchEngagementError.message}`)
          }

          totalWithEngagement += successfulEngagement
          if (engagementErrors.length > 0) errors.push(...engagementErrors.slice(0, 5))

        } else {
          console.error(`❌ [${syncRecord._id}] Nenhuma operação para executar!`)
        }
      } catch (batchError: any) {
        totalErrors++
        errors.push(`Erro no lote ${i}-${i + batchSize}: ${batchError.message}`)
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    let newClassesCreated = 0
    for (const classId of uniqueClassIds) {
      try {
        const existingClass = await Class.findOne({ classId })
        if (!existingClass) {
          await Class.create({
            classId,
            name: `Turma ${classId}`,
            description: `Turma sincronizada da Hotmart em ${new Date().toLocaleDateString('pt-PT')}`,
            source: 'hotmart_sync',
            isActive: true,
            studentCount: 0,
            lastSyncAt: new Date()
          })
          newClassesCreated++
        }
      } catch (classError: any) {
        errors.push(`Erro ao criar turma ${classId}: ${classError.message}`)
      }
    }

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: 'completed',
      completedAt: new Date(),
      'metadata.currentStep': 'Sincronização concluída com engagement',
      'metadata.progress': 100,
      stats: {
        total: totalProcessed,
        added: totalInserted,
        updated: totalUpdated,
        conflicts: 0,
        errors: totalErrors
      },
      errorDetails: errors.length > 0 ? errors.slice(0, 50) : undefined
    })

    res.status(200).json({
      message: 'Sincronização Hotmart concluída com pré-cálculo de engagement!',
      stats: {
        total: totalProcessed,
        added: totalInserted,
        updated: totalUpdated,
        withProgress: totalWithProgress,
        withEngagement: totalWithEngagement,
        withClasses: totalWithClasses,
        newClassesCreated,
        uniqueClasses: uniqueClassIds.size,
        classIds: Array.from(uniqueClassIds),
        errors: totalErrors
      }
    })

  } catch (error: any) {
    console.error(`💥 [${syncRecord?._id}] ERRO CRÍTICO NA SINCRONIZAÇÃO:`, error)

    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'failed',
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [error.message]
      })
    }

    res.status(500).json({
      message: 'Erro crítico na sincronização com Hotmart',
      error: error.message,
      details: error.stack
    })
  }
}

// ✅ SYNC apenas progresso (legacy)
export const syncProgressOnly = async (req: Request, res: Response): Promise<void> => {
  let syncRecord: any = null

  try {
    syncRecord = await SyncHistory.create({
      type: 'hotmart',
      status: 'running',
      startedAt: new Date(),
      metadata: {
        includeProgress: true,
        includeLessons: true,
        syncType: 'progress_only'
      }
    })

    const accessToken = await getHotmartAccessToken()

    const existingUsers = await User.find({
'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }

    }).select('_id email name hotmart.hotmartUserId')

    if (existingUsers.length === 0) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'completed',
        completedAt: new Date(),
        'metadata.currentStep': 'Nenhum utilizador com Hotmart ID encontrado',
        'metadata.progress': 100,
        stats: { total: 0, errors: 0 }
      })

      res.status(200).json({
        message: 'Nenhum utilizador com Hotmart ID encontrado para sincronização de progresso',
        stats: { total: 0, errors: 0 }
      })
      return
    }

    let totalProcessed = 0
    let totalWithProgress = 0
    let totalErrors = 0
    const errors: string[] = []

    for (const u of existingUsers as any[]) {
      try {
        const progressPercentage = (totalProcessed / existingUsers.length) * 100
        await SyncHistory.findByIdAndUpdate(syncRecord._id, {
          'metadata.currentStep': `Atualizando progresso: ${u.email}`,
          'metadata.progress': progressPercentage,
          'metadata.processed': totalProcessed,
          'metadata.withProgress': totalWithProgress
        })

        const hotmartUserId = u.hotmart?.hotmartUserId
        if (!hotmartUserId) {
          totalErrors++
          errors.push(`User sem hotmartUserId: ${u.email}`)
          totalProcessed++
          continue
        }

        const userLessons = await fetchUserLessons(hotmartUserId, accessToken)

        if (userLessons.length > 0) {
          totalWithProgress++
          const progressData = calculateProgress(userLessons)

          await User.findByIdAndUpdate(u._id, {
            'hotmart.progress': {
              totalTimeMinutes: 0,
              completedLessons: progressData.completed,
              lessonsData: progressData.lessons.map((l: any) => ({
                lessonId: l.pageId,
                title: l.pageName,
                completed: l.isCompleted,
                completedAt: l.completedDate,
                timeSpent: 0
              })),
              lastAccessDate: new Date()
            },
            'hotmart.lastSyncAt': new Date(),
            'metadata.updatedAt': new Date(),
            'metadata.sources.hotmart.lastSync': new Date()
          })
        }

        totalProcessed++
      } catch (userError: any) {
        totalErrors++
        errors.push(`Erro ao atualizar progresso de ${u.email}: ${userError.message}`)
        totalProcessed++
      }

      await new Promise(resolve => setTimeout(resolve, 150))
    }

    await SyncHistory.findByIdAndUpdate(syncRecord._id, {
      status: 'completed',
      completedAt: new Date(),
      'metadata.progress': 100,
      'metadata.currentStep': 'Sincronização de progresso concluída',
      stats: { total: totalProcessed, errors: totalErrors },
      errorDetails: errors.length > 0 ? errors : undefined
    })

    res.status(200).json({
      message: 'Sincronização de progresso concluída!',
      stats: { total: totalProcessed, withProgress: totalWithProgress, errors: totalErrors }
    })

  } catch (error: any) {
    if (syncRecord) {
      await SyncHistory.findByIdAndUpdate(syncRecord._id, {
        status: 'failed',
        completedAt: new Date(),
        'metadata.currentStep': 'Erro na sincronização',
        errorDetails: [error.message]
      })
    }

    res.status(500).json({ message: 'Erro na sincronização de progresso', error: error.message })
  }
}

// ✅ Compatibilidade
export const findHotmartUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.query

    if (!email) {
      res.status(400).json({ message: 'Email é obrigatório' })
      return
    }

    const foundUser: any = await User.findOne({ email: String(email) })

    if (!foundUser) {
      res.status(404).json({ message: 'Utilizador não encontrado' })
      return
    }

    res.status(200).json({
      message: 'Utilizador encontrado',
      user: {
        id: foundUser._id,
        email: foundUser.email,
        name: foundUser.name,
        hotmartUserId: foundUser.hotmart?.hotmartUserId,
        status: foundUser.combined?.status,
        progress: foundUser.combined?.totalProgress
      }
    })
  } catch (error: any) {
    res.status(500).json({ message: 'Erro ao buscar utilizador', error: error.message })
  }
}

// ✅ TESTE DA BD
export const testDatabaseConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    const userCount = await User.countDocuments()

    const testUser = await User.create({
      email: 'test-connection@example.com',
      name: 'Test Connection User'
    })

    await User.findByIdAndUpdate(testUser._id, { name: 'Test Updated' }, { new: true })
    await User.findByIdAndDelete(testUser._id)

    res.json({
      success: true,
      message: 'Todos os testes da BD passaram com sucesso',
      userCount,
      testPassed: true,
      connectionStatus: 'OK'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: 'Erro no teste da BD',
      error: error.message,
      connectionStatus: 'FAILED'
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ✅ UNIVERSAL SYNC ENDPOINTS (NOVOS)
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/hotmart/sync/universal
 * Sincronização Hotmart usando Universal Sync Service
 */
export const syncHotmartUsersUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('🚀 [HotmartUniversal] Iniciando sync via Universal Service...')

  try {
    console.log('📡 [HotmartUniversal] Buscando dados via Adapter...')

    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync({
      includeProgress: true,
      includeLessons: true,
      progressConcurrency: 5
    })

    console.log(`✅ [HotmartUniversal] ${hotmartData.length} utilizadores preparados`)

    if (hotmartData.length === 0) {
      res.status(200).json({
        success: false,
        message: 'Nenhum utilizador encontrado na Hotmart',
        data: { stats: { total: 0, inserted: 0, updated: 0, errors: 0 } }
      })
      return
    }

    console.log('⚡ [HotmartUniversal] Executando Universal Sync...')

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Hotmart Universal Sync (Manual)',
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),

      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,

      sourceData: hotmartData,

onProgress: (progress: SyncProgress) => {
  if (progress.current % 100 === 0 || progress.percentage === 100) {
    console.log(`📊 [HotmartUniversal] ${progress.percentage.toFixed(1)}% (${progress.current}/${progress.total})`)
  }
},

onError: (error: SyncError) => {
  console.error(`❌ [HotmartUniversal] Erro: ${error.message}`)
},

onWarning: (warning: SyncWarning) => {
  console.warn(`⚠️ [HotmartUniversal] Aviso: ${warning.message}`)
}

    })

    console.log('✅ [HotmartUniversal] Sync concluída!')
    console.log(`   ⏱️ Duração: ${result.duration}s`)
    console.log(`   ✅ Inseridos: ${result.stats.inserted}`)
    console.log(`   🔄 Atualizados: ${result.stats.updated}`)
    console.log(`   ❌ Erros: ${result.stats.errors}`)

    res.status(200).json({
      success: result.success,
      message: result.success
        ? 'Sincronização via Universal Service concluída com sucesso!'
        : 'Sincronização concluída com erros',
      data: {
        reportId: result.reportId,
        syncHistoryId: result.syncHistoryId,
        stats: result.stats,
        duration: result.duration,
        errorsCount: result.errors.length,
        warningsCount: result.warnings.length,
        reportUrl: `/api/sync/reports/${result.reportId}`,
        syncHistoryUrl: `/api/sync/history/${result.syncHistoryId}`
      },
      _universalSync: true,
      _version: '3.0'
    })

  } catch (error: any) {
    console.error('❌ [HotmartUniversal] Erro fatal:', error)

    res.status(500).json({
      success: false,
      message: 'Erro ao executar sincronização via Universal Service',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    })
  }
}

/**
 * POST /api/hotmart/sync/universal/progress
 * Sincronizar apenas progresso usando Universal Sync
 */
export const syncProgressOnlyUniversal = async (req: Request, res: Response): Promise<void> => {
  console.log('📊 [HotmartProgress] Iniciando sync de progresso via Universal...')

  try {
    const existingUsers = await User.find({
'hotmart.hotmartUserId': { $exists: true, $nin: [null, ''] }

    }).select('hotmart.hotmartUserId email name').lean()

    console.log(`📊 [HotmartProgress] ${existingUsers.length} utilizadores com Hotmart ID`)

    if (existingUsers.length === 0) {
      res.status(200).json({
        success: true,
        message: 'Nenhum utilizador com Hotmart ID encontrado',
        data: { stats: { total: 0 } }
      })
      return
    }

    const userIds = existingUsers
      .map((u: any) => u.hotmart?.hotmartUserId)
      .filter(Boolean)

    const progressMap = await hotmartAdapter.fetchProgressForExistingUsers(userIds)

    const progressData = existingUsers.map((u: any) => {
      const hotmartId = u.hotmart?.hotmartUserId
      const progress = hotmartId ? progressMap.get(hotmartId) : undefined

      return {
        email: u.email,
        name: u.name,
        hotmartUserId: hotmartId,
        progress: progress || undefined
      }
    })

    const result = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Hotmart Progress Sync (Universal)',
      triggeredBy: 'MANUAL',
      triggeredByUser: (req as any).user?._id?.toString(),
      fullSync: false,
      includeProgress: true,
      includeTags: false,
      batchSize: 100,
      sourceData: progressData
    })

    res.status(200).json({
      success: result.success,
      message: 'Progresso sincronizado via Universal Service!',
      data: {
        reportId: result.reportId,
        stats: result.stats,
        duration: result.duration,
        withProgress: progressMap.size
      },
      _universalSync: true
    })

  } catch (error: any) {
    console.error('❌ [HotmartProgress] Erro:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

/**
 * GET /api/hotmart/sync/compare
 * Comparar resultados: Legacy vs Universal
 */
export const compareSyncMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const SyncReport = (await import('../../models/SyncModels/SyncReport')).default as any

    const legacyHistory = await SyncHistory.find({ type: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats')
      .lean()

    const universalReports = await SyncReport.find({ syncType: 'hotmart' })
      .sort({ startedAt: -1 })
      .limit(5)
      .select('startedAt completedAt status stats duration')
      .lean()

    res.json({
      success: true,
      data: {
        legacy: {
          count: legacyHistory.length,
          latest: legacyHistory[0],
          all: legacyHistory
        },
        universal: {
          count: universalReports.length,
          latest: universalReports[0],
          all: universalReports
        },
        comparison: {
          avgDurationLegacy: legacyHistory.reduce((sum: number, h: any) => {
            const duration = h.completedAt && h.startedAt
              ? (new Date(h.completedAt).getTime() - new Date(h.startedAt).getTime()) / 1000
              : 0
            return sum + duration
          }, 0) / (legacyHistory.length || 1),

          avgDurationUniversal: universalReports.reduce(
            (sum: number, r: any) => sum + (r.duration || 0),
            0
          ) / (universalReports.length || 1)
        }
      }
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message })
  }
}
