// src/controllers/users.controller.ts - PARTE 1/3
import { Request, Response } from "express"
import User, { type IUser } from "../models/user"
import mongoose from "mongoose"

import StudentClassHistory from "../models/StudentClassHistory"
import { Class } from "../models/Class"
import { getRuntimeConfig } from "../config/runtimeConfig"
import { cacheService } from "../services/cache.service"
import type {
  UsersDeleteStudentInput,
} from "../security/usersDestructiveInput"

type PipelineStage = mongoose.PipelineStage
type UserIdParams = { id: string }

interface UserListRecord {
  _id: mongoose.Types.ObjectId
  email?: string
  name?: string
  username?: string
  classId?: string
  className?: string
  status?: string
  estado?: string
  role?: string
  type?: string
  purchaseDate?: Date
  lastAccessDate?: Date
  acceptedTerms?: boolean
  plusAccess?: boolean
  hotmartUserId?: string
  curseducaUserId?: string
  discordIds?: string[]
  engagement?: string
  accessCount?: number
  progress?: { completedPercentage?: number }
  hotmart?: IUser['hotmart']
  curseduca?: IUser['curseduca']
  combined?: IUser['combined']
  preComputed?: {
    engagementScore?: number
    activityLevel?: string
  }
  engagementScore?: number
  activityLevel?: string
  isPreComputed?: boolean
  hasDiscord?: boolean
  hasHotmart?: boolean
  hasCurseduca?: boolean
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function errorStack(error: unknown): string | undefined {
  return error instanceof Error ? error.stack : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// 📋 LISTAGEM DE UTILIZADORES
interface CachedUsersData {
  success: boolean
  users: UserListRecord[]
  hasMore: boolean
  nextCursor: string | null
  totalCount?: number
  meta: {
    limit: number
    returned: number
    preCalculated: boolean
    performance: {
      totalTime: number
      queryTime: number
      fromCache: boolean
    }
  }
  cachedAt: number
}

/**
 * PUT /api/users/:id
 * Editar aluno (mantido)
 */
export const editStudent = async (req: Request<UserIdParams>, res: Response): Promise<void> => {
  const { id } = req.params
  const updateData = req.body

  try {
    const currentStudent = await User.findById(id)
    if (!currentStudent) {
      res.status(404).json({ message: "Aluno não encontrado" })
      return
    }

    const updateFields: mongoose.UpdateQuery<IUser> = {}

    if (updateData.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(updateData.email)) {
        res.status(400).json({ message: "Email inválido" })
        return
      }
      updateFields.email = updateData.email
    }

    if (updateData.name) updateFields.name = updateData.name

    if (updateData.discordIds && Array.isArray(updateData.discordIds)) {
      const uniqueIds = [...new Set(updateData.discordIds)]
      updateFields["discord.discordIds"] = uniqueIds
      updateFields["discordIds"] = uniqueIds
    }

    updateFields["metadata.updatedAt"] = new Date()

    const updatedStudent = await User.findByIdAndUpdate(
      id, 
      updateFields, 
      { new: true, runValidators: true }
    )

    if (updateData.discordIds) {
      await recalculateCombinedData(id)
    }

    res.status(200).json(updatedStudent)

  } catch (error: unknown) {
    res.status(500).json({ message: "Erro ao atualizar aluno", details: errorMessage(error) })
  }
}
// 📊 ESTATÍSTICAS DO ALUNO

// 🔄 SINCRONIZAR ALUNO ESPECÍFICO
export const syncSpecificStudent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params

  try {
    const student = await User.findById(id)
    
    if (!student) {
      res.status(404).json({ message: "Aluno não encontrado." })
      return
    }
    
    // Aqui implementaria a lógica de sincronização específica com Hotmart
    // Por agora, apenas confirma que o aluno existe
    
    res.status(200).json({ 
      message: "Sincronização específica iniciada para o aluno.",
      email: student.email 
    })
  } catch (error: unknown) {
    res.status(500).json({ 
      message: "Erro ao sincronizar aluno.", 
      details: errorMessage(error)
    })
  }
}


/**
 * DELETE /api/users/:id
 * Eliminar aluno (mantido)
 */
export const deleteStudent = async (input: UsersDeleteStudentInput, res: Response): Promise<void> => {
  const { id } = input.params
  const { permanent = 'false' } = input.query

  try {
    if (permanent === 'true') {
      const deleted = await User.findByIdAndDelete(id)
      if (!deleted) {
        res.status(404).json({ message: "Aluno não encontrado" })
        return
      }
      await StudentClassHistory.deleteMany({ studentId: id })
      res.status(200).json({ message: "Aluno eliminado permanentemente" })
    } else {
      const updated = await User.findByIdAndUpdate(
        id,
        { 
          status: 'BLOCKED',
          estado: 'inativo',
          updatedAt: new Date()
        },
        { new: true }
      )
      if (!updated) {
        res.status(404).json({ message: "Aluno não encontrado" })
        return
      }
      res.status(200).json({ message: "Aluno marcado como inativo", student: updated })
    }
  } catch (error: unknown) {
    res.status(500).json({ message: "Erro ao eliminar aluno", details: errorMessage(error) })
  }
}
/**
 * ✅ ENDPOINT OTIMIZADO: Infinite Loading de Utilizadores
 * Cursor-based pagination para performance máxima
 */
export const getUsersInfinite = async (req: Request, res: Response): Promise<void> => {
  try {
    const startTime = Date.now()
    
    // ✅ PARÂMETROS com validação e sanitização
    const cursor = req.query.cursor as string
    const limit = Math.min(100, Math.max(10, parseInt(req.query.limit as string) || 50))
    const search = req.query.search?.toString().trim()
    const status = req.query.status as string
    const engagementLevel = req.query.engagementLevel as string
    const source = req.query.source as string
    const includePreCalculated = req.query.includePreCalculated === 'true'
    const forceRefresh = req.query.forceRefresh === 'true'

    // ✅ GERAR CACHE KEY única
    const cacheKey = cacheService.getCacheKey('users:infinite', {
      cursor,
      limit,
      search,
      status,
      engagementLevel,
      source,
      includePreCalculated
    })

    // ✅ VERIFICAR CACHE (se não for force refresh)
    if (!forceRefresh) {
      const cached = await cacheService.get<CachedUsersData>(cacheKey)
      if (cached) {
        console.log(`📦 Cache hit: ${cacheKey.substring(0, 50)}...`)
        res.status(200).json({
          ...cached,
          fromCache: true,
          cacheAge: Date.now() - ((cached && cached.cachedAt) || Date.now()),
          timestamp: new Date().toISOString()
        })
        return
      }
    }

    console.log(`🔍 Infinite Users Query:`, {
      cursor: cursor ? `${cursor.slice(0, 8)}...` : 'none',
      limit,
      search: search || 'none',
      status: status || 'all',
      engagementLevel: engagementLevel || 'all',
      includePreCalculated,
      forceRefresh
    })

    // ✅ CAMPOS otimizados com seleção dinâmica
    const baseFields = {
      _id: 1,
      name: 1,
      email: 1,
      status: 1,
      estado: 1,
      className: 1  // Adicionado para o frontend
    }

    const conditionalFields = includePreCalculated ? {
      'preComputed.engagementScore': 1,
      'preComputed.activityLevel': 1,
      'preComputed.lastCalculated': 1
    } : {
      accessCount: 1,
      discordIds: 1,
      purchaseDate: 1,
      classId: 1,
      hotmartUserId: 1,
      curseducaUserId: 1,
      lastAccessDate: 1,
      engagement: 1,
      'progress.completedPercentage': 1,
      'progress.completed': 1,
      'progress.total': 1
    }

    const fields = { ...baseFields, ...conditionalFields }

    // ✅ CONSTRUIR PIPELINE de agregação (mais eficiente para queries complexas)
    const pipeline: PipelineStage[] = []

    // Stage 1: Match básico com índices otimizados
    const matchStage: mongoose.PipelineStage.Match = {
      $match: {
        $or: [
          { isDeleted: { $exists: false } },
          { isDeleted: false }
        ]
      }
    }

    // Cursor-based pagination
    if (cursor) {
      matchStage.$match._id = { $lt: cursor }
    }

    // Filtro de status (usar índice)
    if (status && status !== 'all') {
      if (status === 'active') {
        matchStage.$match.$and = matchStage.$match.$and || []
        matchStage.$match.$and.push({
          $or: [
            { status: 'ACTIVE' },
            { estado: { $in: ['ativo', 'active'] } }
          ]
        })
      } else if (status === 'inactive') {
        matchStage.$match.$and = matchStage.$match.$and || []
        matchStage.$match.$and.push({
          $and: [
            { status: { $ne: 'ACTIVE' } },
            { estado: { $nin: ['ativo', 'active'] } }
          ]
        })
      }
    }

    // Filtro de engagement (usar índice pre-computado)
    if (engagementLevel && engagementLevel !== 'all' && includePreCalculated) {
      matchStage.$match['preComputed.activityLevel'] = engagementLevel
    }

    // Filtro de source
    if (source && source !== 'all') {
      matchStage.$match.source = source
    }

    pipeline.push(matchStage)

    // Stage 2: Text search (se houver)
    if (search) {
      // Usar índice de texto se disponível
      pipeline.push({
        $match: {
          $or: [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { $text: { $search: search } }  // Usar índice de texto se existir
          ]
        }
      })
    }

    // Stage 3: Sort (usar índice)
    pipeline.push({ $sort: { _id: -1 } })

    // Stage 4: Limit
    pipeline.push({ $limit: limit + 1 })

    // Stage 5: Project (reduzir transferência de dados)
    pipeline.push({ $project: fields })

    // Stage 6: AddFields para campos calculados
    if (includePreCalculated) {
      pipeline.push({
        $addFields: {
          engagementScore: { $ifNull: ['$preComputed.engagementScore', 0] },
          activityLevel: { $ifNull: ['$preComputed.activityLevel', 'unknown'] },
          isPreComputed: { $ne: ['$preComputed.lastCalculated', null] }
        }
      })
    } else {
      pipeline.push({
        $addFields: {
          hasDiscord: {
            $and: [
              { $isArray: '$discordIds' },
              { $gt: [{ $size: '$discordIds' }, 0] }
            ]
          },
          hasHotmart: {
            $and: [
              { $ne: ['$hotmartUserId', null] },
              { $ne: ['$hotmartUserId', ''] }
            ]
          },
          hasCurseduca: {
            $and: [
              { $ne: ['$curseducaUserId', null] },
              { $ne: ['$curseducaUserId', ''] }
            ]
          }
        }
      })
    }

    // ✅ EXECUTAR AGREGAÇÃO com timeout
    const queryStartTime = Date.now()
    
    const users = await User.aggregate<UserListRecord>(pipeline)
      .allowDiskUse(true)  // Para queries grandes
      .option({ maxTimeMS: 30000 })  // Timeout 30s
      .exec()

    const queryTime = Date.now() - queryStartTime

    // ✅ VERIFICAR próxima página
    const hasMore = users.length > limit
    if (hasMore) {
      users.pop()
    }

    // ✅ OBTER CONTAGEM TOTAL (otimizada)
    let totalCount: number | undefined
    
    if (!cursor) {
      // Usar contagem estimada para melhor performance
      const countStartTime = Date.now()
      
      try {
        // Tentar usar contagem estimada primeiro (muito mais rápido)
      const estimatedCount = await User.estimatedDocumentCount()
        
        // Se a query tem filtros, fazer contagem exata
        if (search || (status && status !== 'all') || (engagementLevel && engagementLevel !== 'all')) {
          const countPipeline: PipelineStage[] = [matchStage]
          if (search) {
            countPipeline.push({
              $match: {
                $or: [
                  { name: { $regex: search, $options: 'i' } },
                  { email: { $regex: search, $options: 'i' } }
                ]
              }
            })
          }
          countPipeline.push({ $count: 'total' })
          
          const countResult = await User.aggregate(countPipeline)
            .option({ maxTimeMS: 5000 })  // Timeout mais curto para contagem
            .exec()
          
          totalCount = countResult[0]?.total || 0
        } else {
          // Usar estimativa para queries sem filtros
          totalCount = estimatedCount
        }
      } catch (countError) {
        console.warn('⚠️ Falha na contagem, usando estimativa')
        totalCount = undefined  // Não incluir se falhar
      }
      
      const countTime = Date.now() - countStartTime
      console.log(`📊 Contagem: ${totalCount || 'skipped'} (${countTime}ms)`)
    }

    // ✅ PROCESSAR RESULTADOS
    const processedUsers = users.map(user => ({
      _id: user._id,
      name: user.name || '',
      email: user.email || '',
      status: user.status || user.estado || 'unknown',
      estado: user.estado,
      className: user.className || '',
      
      // Campos condicionais
      ...(includePreCalculated ? {
        engagementScore: user.engagementScore || user.preComputed?.engagementScore || 0,
        activityLevel: user.activityLevel || user.preComputed?.activityLevel || 'unknown',
        isPreComputed: user.isPreComputed || false
      } : {
        accessCount: user.accessCount || 0,
        discordIds: user.discordIds || [],
        progress: user.progress || { completedPercentage: 0 },
        hasDiscord: user.hasDiscord || false,
        hasHotmart: user.hasHotmart || false,
        hasCurseduca: user.hasCurseduca || false,
        purchaseDate: user.purchaseDate,
        lastAccessDate: user.lastAccessDate
      })
    }))

    const totalTime = Date.now() - startTime

    // ✅ PREPARAR RESPOSTA
    const responseData = {
      success: true,
      users: processedUsers,
      hasMore,
      nextCursor: processedUsers.length > 0 ? processedUsers[processedUsers.length - 1]._id : null,
      ...(totalCount !== undefined && { totalCount }),
      meta: {
        limit,
        returned: processedUsers.length,
        preCalculated: includePreCalculated,
        performance: {
          totalTime,
          queryTime,
          fromCache: false
        }
      },
      cachedAt: Date.now()
    }

    // ✅ GUARDAR NO CACHE (assíncrono, não esperar)
    const cacheTTL = search ? 30 : 60  // TTL menor para pesquisas
    cacheService.set(cacheKey, responseData, cacheTTL).catch(err => {
      console.warn('⚠️ Falha ao guardar cache:', err.message)
    })

    // ✅ LOGS de performance
    console.log(`✅ Infinite query concluída:`, {
      returned: processedUsers.length,
      hasMore,
      totalCount: totalCount || 'not calculated',
      totalTime: `${totalTime}ms`,
      queryTime: `${queryTime}ms`,
      cached: false
    })

    // ✅ ENVIAR RESPOSTA
    res.status(200).json({
      ...responseData,
      timestamp: new Date().toISOString()
    })

  } catch (error: unknown) {
    console.error('❌ Erro no infinite loading:', error)
    
    // Log detalhado para debugging
    if (
      isRecord(error)
      && (error.name === 'MongoError' || error.name === 'MongooseError')
    ) {
      console.error('MongoDB Error Details:', {
        code: error.code,
        codeName: error.codeName,
        errmsg: error.errmsg
      })
    }
    
    res.status(500).json({
      success: false,
      message: 'Erro ao carregar utilizadores',
      error: getRuntimeConfig().core.nodeEnv === 'development' ? errorMessage(error) : 'Internal server error',
      timestamp: new Date().toISOString()
    })
  }
}

// ===== MIDDLEWARE: Recalcular Dados Combinados =====

/**
 * Recalcular dados combinados após update
 */
const recalculateCombinedData = async (userId: string): Promise<void> => {
  try {
    const user = await User.findById(userId)
    if (!user) return

    const sourcesAvailable = []
    if (user.discord?.discordIds?.length) sourcesAvailable.push('discord')
    if (user.hotmart?.hotmartUserId) sourcesAvailable.push('hotmart')
    if (user.curseduca?.curseducaUserId) sourcesAvailable.push('curseduca')

    let status = 'ACTIVE'
    if (user.discord?.isDeleted) status = 'INACTIVE'
    else if (user.curseduca?.memberStatus === 'INACTIVE') status = 'INACTIVE'

    let totalProgress = 0
    let combinedEngagement = 0
    let bestEngagementSource = 'estimated'

    if (user.hotmart?.progress) {
      const totalTimeMinutes = user.hotmart.progress.totalTimeMinutes || 0
      totalProgress = Math.min((totalTimeMinutes / (20 * 60)) * 100, 100)
      combinedEngagement = user.hotmart.engagement?.engagementScore || 0
      bestEngagementSource = 'hotmart'
    } else if (user.curseduca?.progress) {
      totalProgress = user.curseduca.progress.estimatedProgress || 0
      combinedEngagement = user.curseduca.engagement?.alternativeEngagement || 0
      bestEngagementSource = 'curseduca'
    }

    const combinedData = {
      status,
      totalProgress: Math.round(totalProgress * 100) / 100,
      combinedEngagement: Math.round(combinedEngagement * 100) / 100,
      bestEngagementSource,
      sourcesAvailable,
      calculatedAt: new Date()
    }

    await User.findByIdAndUpdate(userId, { 
      combined: combinedData,
      "metadata.updatedAt": new Date()
    })

  } catch (error: unknown) {
    console.error(`❌ Erro ao recalcular dados combinados para ${userId}:`, errorMessage(error))
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 📋 LISTAGEM DE UTILIZADORES (V2 - COM USERPRODUCTS)
// ═


/**
 * Transforma dados segregados do modelo User para formato retrocompatível com o frontend
 */
