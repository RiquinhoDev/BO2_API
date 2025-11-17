// src/controllers/curseduca.controller.ts - CONTROLLER CORRIGIDO SEGUINDO PADRÃO HOTMART
import { Request, Response } from 'express'
import User from '../models/user'
import {
  testCurseducaConnection,
  syncCurseducaMembers,
  syncCurseducaProgress,
  getCurseducaDashboardStats
} from '../services/curseducaService'

// 🧪 TESTE DE CONEXÃO (igual ao padrão Hotmart)
export const testConnection = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('🧪 === TESTE DE CONEXÃO CURSEDUCA ===')
    const result = await testCurseducaConnection()
    
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
    
    // Chamar o service corrigido (igual ao Hotmart)
    const result = await syncCurseducaMembers()
    
    console.log(`${result.success ? '✅' : '❌'} Resultado:`, result.message)
    console.log('📊 Estatísticas:', result.stats)
    
    // Estrutura de resposta IDÊNTICA ao Hotmart
    if (result.success) {
      res.status(200).json({
        success: true,  // ✅ Adicionar campo success
        message: result.message,
        stats: result.stats
      })
    } else {
      res.status(500).json({
        success: false,  // ✅ Adicionar campo success
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
      success: false,  // ✅ Adicionar campo success
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
    
    const result = await syncCurseducaProgress()
    
    // Estrutura de resposta IDÊNTICA ao Hotmart
    if (result.success) {
      res.status(200).json({
        success: true,  // ✅ Adicionar campo success
        message: result.message,
        stats: result.stats
      })
    } else {
      res.status(500).json({
        success: false,  // ✅ Adicionar campo success
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
      success: false,  // ✅ Adicionar campo success
      message: 'Erro na sincronização de progresso CursEduca',
      error: error.message
    })
  }
}

// 📊 DASHBOARD STATS
export const getDashboardStats = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('📊 === CONTROLLER: DASHBOARD CURSEDUCA ===')
    
    const result = await getCurseducaDashboardStats()
    
    if (result.success) {
      res.status(200).json(result)
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        timestamp: new Date().toISOString()
      })
    }
    
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
    // TODO: Implementar busca de grupos da CursEduca
    res.status(501).json({
      success: false,
      message: 'Endpoint de grupos não implementado ainda',
      note: 'Use /syncCurseducaUsers para sincronização completa'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
  }
}

export const getMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implementar busca de membros da CursEduca
    res.status(501).json({
      success: false,
      message: 'Endpoint de membros não implementado ainda',
      note: 'Use /syncCurseducaUsers para sincronização completa'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
  }
}

export const getMemberByEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implementar busca de membro por email
    res.status(501).json({
      success: false,
      message: 'Busca por email não implementada ainda',
      note: 'Use User.findOne({email}) na base de dados local'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
  }
}

export const getAccessReports = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implementar relatórios de acesso
    res.status(501).json({
      success: false,
      message: 'Relatórios de acesso não implementados ainda',
      note: 'Use /dashboard para estatísticas gerais'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
  }
}

export const getCurseducaUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implementar listagem de utilizadores CursEduca
    res.status(501).json({
      success: false,
      message: 'Listagem de utilizadores não implementada ainda',
      note: 'Use GET /api/users?source=CURSEDUCA'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
  }
}

export const debugCurseducaAPI = async (req: Request, res: Response): Promise<void> => {
  try {
    // TODO: Implementar debug da API CursEduca
    res.status(501).json({
      success: false,
      message: 'Debug da API não implementado ainda',
      note: 'Use /test para testar conexão básica'
    })
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
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
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
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
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
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
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
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
    res.status(500).json({
      success: false,
      message: `Erro: ${error.message}`
    })
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