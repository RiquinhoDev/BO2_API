// =====================================================
// 📁 src/controllers/ogiCourse.controller.ts
// Controller para endpoints do curso OGI
// =====================================================

import { Request, Response } from 'express'
import Course from '../models/Course'
import User from '../models/user'
import UserAction from '../models/UserAction'

/**
 * GET /api/courses/ogi/students
 * Retorna estatísticas e lista de alunos do curso OGI
 */
export const getOGIStudents = async (req: Request, res: Response) => {
  try {
    console.log('📊 Buscando alunos OGI...')

    // 1. Buscar curso OGI
    const ogiCourse = await Course.findOne({ code: 'OGI' })
    
    if (!ogiCourse) {
      return res.status(404).json({
        success: false,
        message: 'Curso OGI não encontrado. Execute: npx ts-node src/scripts/seed-ogi.ts'
      })
    }

    // 2. Buscar todos os users que têm OGI
    const users = await User.find({
      'communicationByCourse.OGI': { $exists: true }
    })

    console.log(`📊 Encontrados ${users.length} alunos OGI`)

    // 3. Calcular estatísticas
    const studentsData = []
    let totalDaysSinceLogin = 0
    let totalProgress = 0
    let activeCount = 0
    let inactiveCount = 0

    for (const user of users) {
      // Buscar último login do user no OGI
      const lastLoginAction = await UserAction.findOne({
        userId: user._id,
        courseId: ogiCourse._id,
        actionType: 'LOGIN'
      }).sort({ actionDate: -1 })

      // Calcular dias desde último login
      const daysSinceLastLogin = lastLoginAction
        ? Math.floor((Date.now() - lastLoginAction.actionDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999 // Se nunca fez login, colocar 999

      // Buscar progresso do aluno
      const ogiData = user.communicationByCourse?.get('OGI')
      const progress = ogiData?.courseSpecificData?.currentModule || 0

      // Contar ativos vs inativos (ativo = login nos últimos 10 dias)
      totalDaysSinceLogin += daysSinceLastLogin
      totalProgress += progress

      if (daysSinceLastLogin <= 10) {
        activeCount++
      } else {
        inactiveCount++
      }

      // Preparar dados do aluno
      studentsData.push({
        _id: user.id.toString(),
        email: user.email,
        name: user.name || user.email.split('@')[0],
        daysSinceLastLogin,
        lastLogin: lastLoginAction?.actionDate || user.metadata.createdAt,
        currentProgress: progress,
        currentTags: ogiData?.currentTags || [],
        activeCampaignId: user.metadata.activeCampaignId
      })
    }

    // 4. Calcular médias
    const totalStudents = users.length
    const averageDaysSinceLogin = totalStudents > 0 
      ? Math.round(totalDaysSinceLogin / totalStudents) 
      : 0

    const averageProgress = totalStudents > 0 
      ? Math.round((totalProgress / totalStudents) * 10) / 10 
      : 0

    // 5. Retornar response
    console.log(`✅ Stats OGI: ${totalStudents} alunos, ${activeCount} ativos, ${inactiveCount} inativos`)

    res.json({
      success: true,
      stats: {
        totalStudents,
        activeStudents: activeCount,
        inactiveStudents: inactiveCount,
        averageDaysSinceLogin,
        averageProgress,
        students: studentsData.sort((a, b) => b.daysSinceLastLogin - a.daysSinceLastLogin)
      }
    })
  } catch (error: any) {
    console.error('❌ Erro ao buscar alunos OGI:', error)
    res.status(500).json({ 
      success: false, 
      message: error.message 
    })
  }
}

/**
 * POST /api/courses/ogi/evaluate
 * ✅ MIGRADO: Use /api/activecampaign/test-cron para avaliação com DecisionEngine
 */
export const evaluateOGIRules = async (req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    message: 'Endpoint descontinuado. Use POST /api/activecampaign/test-cron para avaliação por produto'
  })
}

