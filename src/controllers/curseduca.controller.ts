// src/controllers/curseduca.controller.ts - CONTROLLER UNIFICADO (v1 + v2) COM TIPOS CORRIGIDOS

import { Request, Response } from 'express'
import User from '../models/user'
import Product from '../models/Product'
import {
  testCurseducaConnection,
  syncCurseducaMembers,
  syncCurseducaProgress,
  getCurseducaDashboardStats
} from '../services/curseducaService'
import {
  getUsersByProduct as getUsersByProductService,
  getUserCountForProduct
} from '../services/userProductService'

// ─────────────────────────────────────────────────────────────
// Tipos auxiliares (para calar TS sem mexer nos services)
// ─────────────────────────────────────────────────────────────

type ServiceResult<TStats = unknown> = {
  success: boolean
  message?: string
  details?: unknown
  stats?: TStats
}


type DashboardRawStats = {
  totalUsers: number
  activeUsers: number
  totalUserProducts: number
  products: number
}

function isServiceResult(val: unknown): val is { success: boolean; message?: string } {
  return !!val && typeof val === 'object' && 'success' in val
}

// 🧪 TESTE DE CONEXÃO (igual ao padrão Hotmart)
export const testConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧪 === TESTE DE CONEXÃO CURSEDUCA ===')
    const result = (await testCurseducaConnection()) as ServiceResult

    console.log(`${result.success ? '✅' : '❌'} Resultado:`, result.message)

    res.status(result.success ? 200 : 500).json({
      success: result.success,
      message: result.message,
      details: result.details,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Erro no teste de conexão:', error)
    res.status(500).json({
      success: false,
      message: `Erro interno: ${error.message}`,
      timestamp: new Date().toISOString()
    })
  }
}

// 🔄 SINCRONIZAÇÃO COMPLETA (SEGUINDO EXATAMENTE O PADRÃO HOTMART)
export const syncCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🚀 === CONTROLLER: SINCRONIZAÇÃO CURSEDUCA INICIADA ===')

type SyncMembersStats = {
  groupsProcessed?: number
  created: number
  updated: number
  skipped: number
  errors: number
}

const result = (await syncCurseducaMembers()) as ServiceResult<SyncMembersStats>

const message =
  result.message ?? (result.success ? 'Sincronização concluída com sucesso' : 'Falha na sincronização')

console.log(`${result.success ? '✅' : '❌'} Resultado:`, message)
console.log('📊 Estatísticas:', result.stats)

res.status(result.success ? 200 : 500).json({
  success: result.success,
  message,
  ...(result.success ? {} : { error: message }),
  stats: result.stats || {
    groupsProcessed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 1
  }
})

    console.log(`${result.success ? '✅' : '❌'} Resultado:`, result.message)
    console.log('📊 Estatísticas:', result.stats)

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        stats: result.stats
      })
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.message,
        stats: result.stats || {
          total: 0,
          added: 0,
          updated: 0,
          withProgress: 0,
          withEngagement: 0,
          withClasses: 0,
          newClassesCreated: 0,
          uniqueClasses: 0,
          errors: 1
        }
      })
    }
  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error)
    res.status(500).json({
      success: false,
      message: 'Erro crítico na sincronização com CursEduca',
      error: error.message,
      details: error.stack
    })
  }
}

// 📈 SINCRONIZAÇÃO APENAS PROGRESSO (SEGUINDO PADRÃO HOTMART)
export const syncProgressOnly = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📈 === CONTROLLER: SINCRONIZAÇÃO PROGRESSO CURSEDUCA ===')

    const result = (await syncCurseducaProgress()) as ServiceResult<{
      total: number
      withProgress: number
      errors: number
    }>

    if (result.success) {
      res.status(200).json({
        success: true,
        message: result.message,
        stats: result.stats
      })
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.message,
        stats: result.stats || {
          total: 0,
          withProgress: 0,
          errors: 1
        }
      })
    }
  } catch (error: any) {
    console.error('❌ Erro na sincronização de progresso:', error)
    res.status(500).json({
      success: false,
      message: 'Erro na sincronização de progresso CursEduca',
      error: error.message
    })
  }
}

// 📊 DASHBOARD STATS
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 === CONTROLLER: DASHBOARD CURSEDUCA ===')

    const raw = (await getCurseducaDashboardStats()) as unknown

    // Caso o service já devolva { success, message, ... }
    if (isServiceResult(raw)) {
      const result = raw as { success: boolean; message?: string }
      if (result.success) {
        res.status(200).json(raw)
      } else {
        res.status(500).json({
          success: false,
          message: result.message || 'Erro ao buscar dashboard',
          timestamp: new Date().toISOString()
        })
      }
      return
    }

    // Caso o service devolva só stats (sem success/message)
    const stats = raw as DashboardRawStats
    res.status(200).json({
      success: true,
      message: 'Dashboard carregado com sucesso',
      ...stats,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar dashboard:', error)
    res.status(500).json({
      success: false,
      message: `Erro interno: ${error.message}`,
      timestamp: new Date().toISOString()
    })
  }
}

// 🔍 FUNÇÕES AUXILIARES (endpoints de compatibilidade - retornam 501 por enquanto)
export const getGroups = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Endpoint de grupos não implementado ainda',
      note: 'Use /syncCurseducaUsers para sincronização completa'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const getMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Endpoint de membros não implementado ainda',
      note: 'Use /syncCurseducaUsers para sincronização completa'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const getMemberByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Busca por email não implementada ainda',
      note: 'Use User.findOne({email}) na base de dados local'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const getAccessReports = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Relatórios de acesso não implementados ainda',
      note: 'Use /dashboard para estatísticas gerais'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const getCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Listagem de utilizadores não implementada ainda',
      note: 'Use GET /api/users?source=CURSEDUCA'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const debugCurseducaAPI = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Debug da API não implementado ainda',
      note: 'Use /test para testar conexão básica'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

// 🚀 FUNCIONALIDADES FUTURAS (endpoints preparados para expansão)
export const syncCurseducaUsersIntelligent = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Sincronização inteligente não implementada ainda',
      note: 'Esta funcionalidade será implementada em versão futura'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const getSyncReport = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Relatório de sincronização não implementado ainda',
      note: 'Use /dashboard para estatísticas atuais'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const getUserByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Busca por email não implementada ainda',
      note: 'Use GET /api/users/{id} ou consulte diretamente a BD'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

export const cleanupDuplicates = async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(501).json({
      success: false,
      message: 'Limpeza de duplicados não implementada ainda',
      note: 'Esta funcionalidade será implementada quando necessária'
    })
  } catch (error: any) {
    res.status(500).json({ success: false, message: `Erro: ${error.message}` })
  }
}

// Endpoint para obter utilizadores com múltiplas turmas
export const getUsersWithClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await User.find({
      'curseduca.curseducaUserId': { $exists: true }
    })
      .select('name email curseduca.enrolledClasses curseduca.groupName')
      .lean()

    const stats = {
      total: users.length,
      withSingleClass: users.filter((u: any) => u.curseduca?.enrolledClasses?.length === 1).length,
      withMultipleClasses: users.filter((u: any) => u.curseduca?.enrolledClasses?.length > 1).length,
      withoutClasses: users.filter((u: any) => !u.curseduca?.enrolledClasses?.length).length
    }

    res.json({
      success: true,
      users,
      stats
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// Endpoint para atualizar turmas de um utilizador
export const updateUserClasses = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params
    const { enrolledClasses } = req.body

    const user = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'curseduca.enrolledClasses': enrolledClasses,
          'metadata.updatedAt': new Date()
        }
      },
      { new: true }
    )

    res.json({
      success: true,
      user
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message
    })
  }
}

// ===============================
// 🎯 V2 - CURSEDUCA (SPRINT 5.2)
// ===============================

/**
 * GET /api/curseduca/v2/products
 * Lista todos os produtos CursEduca
 */
export const getCurseducaProducts = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' })
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

export const getCurseducaProductByGroupId = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params

    const product = await Product.findOne({
      platform: 'curseduca',
      'platformData.groupId': groupId
    }).lean()

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    const userCount = await getUserCountForProduct(String((product as any)._id))

    res.json({
      success: true,
      data: {
        ...product,
        userCount
      },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

export const getCurseducaProductUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { groupId } = req.params
    const { minProgress } = req.query

    const product = await Product.findOne({
      platform: 'curseduca',
      'platformData.groupId': groupId
    })

    if (!product) {
      res.status(404).json({
        success: false,
        message: `Produto CursEduca não encontrado para groupId: ${groupId}`
      })
      return
    }

    let users = await getUsersByProductService(String(product._id))

    if (minProgress) {
      const minProg = parseInt(minProgress as string, 10)
      users = users.filter((u: any) =>
        u.products?.some((p: any) => {
          const sameProduct = String(p.product?._id) === String(product._id)
          const prog = p.progress?.progressPercentage || 0
          return sameProduct && prog >= minProg
        })
      )
    }

    res.json({
      success: true,
      data: users,
      count: users.length,
      filters: { minProgress },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}

/**
 * GET /api/curseduca/v2/stats
 * Estatísticas gerais dos produtos CursEduca
 */
export const getCurseducaStats = async (req: Request, res: Response) => {
  try {
    const products = await Product.find({ platform: 'curseduca' }).lean()

    const stats = await Promise.all(
      products.map(async (product: any) => {
        const users = await getUsersByProductService(String(product._id))

        const avgProgress =
          users.length > 0
            ? users.reduce((sum: number, u: any) => {
                const productData = u.products?.find(
                  (p: any) => String(p.product?._id) === String(product._id)
                )
                return sum + (productData?.progress?.progressPercentage || 0)
              }, 0) / users.length
            : 0

        return {
          productId: product._id,
          productName: product.name,
          groupId: product.platformData?.groupId,
          totalUsers: users.length,
          averageProgress: Math.round(avgProgress)
        }
      })
    )

    res.json({
      success: true,
      data: stats,
      summary: {
        totalProducts: products.length,
        totalUsers: stats.reduce((sum, s) => sum + s.totalUsers, 0),
        overallAvgProgress: Math.round(
          stats.reduce((sum, s) => sum + s.averageProgress, 0) / (stats.length || 1)
        )
      },
      _v2Enabled: true
    })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message })
  }
}
