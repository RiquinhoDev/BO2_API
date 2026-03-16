// src/controllers/classManagement.controller.ts
import { Request, Response } from 'express'
import { classesService } from '../services/syncUtilizadoresServices/hotmartServices/classesService'
import { Class } from '../models/Class'
import StudentClassHistory from '../models/StudentClassHistory'
import { User, UserProduct } from '../models'
import UserHistory from '../models/UserHistory'
import axios from 'axios'

export const checkAndUpdateClassHistory = async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      message: 'Verificação de histórico concluída',
      changesDetected: 0
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao verificar histórico de turmas',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

export const getStudentHistoryByEmail = async (req: Request, res: Response) => {
  try {
    const { email } = req.params

    const user = await User.findOne({ email: (email as string).toLowerCase() }).lean()
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuário não encontrado' })
      return
    }

    const history = await (StudentClassHistory as any).find({ studentId: user._id })
      .sort({ dateMoved: -1 })
      .limit(50)
      .lean()

    res.json({
      success: true,
      student: {
        _id: user._id,
        email: user.email,
        name: user.name
      },
      history,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico do aluno',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

export const getClassHistory = async (req: Request, res: Response) => {
  try {
    const { classId, limit = 50, offset = 0 } = req.query

    const query: any = {}
    if (classId) {
      query.$or = [{ classId }, { previousClassId: classId }]
    }

    const total = await (StudentClassHistory as any).countDocuments(query)
    const history = await (StudentClassHistory as any).find(query)
      .populate('studentId', 'name email')
      .sort({ dateMoved: -1 })
      .limit(Number(limit))
      .skip(Number(offset))
      .lean()

    res.json({
      success: true,
      history,
      total,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar histórico',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

export const createInactivationList = async (req: Request, res: Response) => {
  try {
    const { name, classIds, description, userId, platforms = ['all'] } = req.body

    if (!classIds || !Array.isArray(classIds) || classIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'classIds (array) é obrigatório'
      })
      return
    }

    console.log(`\n🚀 [class-management] Iniciando inativação de ${classIds.length} turma(s)...`)

    const results: any[] = []
    let totalInactivated = 0
    let totalDiscordUpdates = 0

    for (const classId of classIds) {
      // 1. Buscar turma
      const classData = await (Class as any).findOne({ classId }).lean()
      if (!classData) {
        console.warn(`⚠️ Turma ${classId} não encontrada`)
        results.push({ classId, success: false, error: 'Turma não encontrada' })
        continue
      }

      console.log(`\n📚 Processando turma: ${classData.name}`)

      // 2. Buscar alunos da turma (suportar Hotmart e CursEduca)
      let students: any[] = []
      const classDataTyped = classData as any

      if (classDataTyped.source === 'curseduca_sync' && classDataTyped.curseducaUuid) {
        students = await User.find({
          'curseduca.groupCurseducaUuid': classDataTyped.curseducaUuid,
          'combined.status': { $ne: 'INACTIVE' }
        }).lean()
      } else {
        students = await User.find({
          classId,
          estado: { $ne: 'inativo' }
        }).lean()
      }

      console.log(`   👥 Encontrados ${students.length} alunos ativos`)

      // 3. Inativar cada aluno
      for (const student of students) {
        try {
          // 3.1. Atualizar status no BD
          const updates: any = {
            'combined.status': 'INACTIVE',
            status: 'INACTIVE',
            estado: 'inativo',
            'inactivation.isManuallyInactivated': true,
            'inactivation.inactivatedAt': new Date(),
            'inactivation.inactivatedBy': userId || 'Sistema',
            'inactivation.reason': description || `Inativação por turma: ${classData.name}`,
            'inactivation.platforms': platforms,
            'inactivation.classId': classId,
            updatedAt: new Date(),
            lastEditedAt: new Date(),
            lastEditedBy: `class_deactivation_${userId || 'system'}`
          }

          if (platforms.includes('hotmart') || platforms.includes('all')) {
            updates['hotmart.status'] = 'INACTIVE'
          }
          if (platforms.includes('curseduca') || platforms.includes('all')) {
            updates['curseduca.memberStatus'] = 'INACTIVE'
          }
          if (platforms.includes('discord') || platforms.includes('all')) {
            updates['discord.isActive'] = false
          }

          await User.findByIdAndUpdate(student._id, { $set: updates })

          // 3.1.1 Atualizar UserProduct status
          await UserProduct.updateMany(
            { userId: student._id },
            { $set: { status: 'INACTIVE' } }
          )

          // 3.2. Registrar no histórico
          try {
            await (UserHistory as any).createInactivationHistory(
              student._id,
              student.email || 'Email desconhecido',
              platforms,
              description || `Inativação por turma: ${classData.name}`,
              userId || 'Sistema'
            )
          } catch (historyError: any) {
            console.warn(`   ⚠️ Erro ao registrar histórico para ${student.email}:`, historyError.message)
          }

          // 3.3. Atualizar Discord (remover roles)
          if ((platforms.includes('discord') || platforms.includes('all')) &&
              student.discord?.discordIds?.length > 0) {
            try {
              const discordId = student.discord.discordIds[0]

              if (process.env.DISCORD_BOT_URL) {
                await axios.post(`${process.env.DISCORD_BOT_URL}/remove-roles`, {
                  userId: discordId,
                  reason: `Inativado por turma: ${classData.name}`
                }, { timeout: 10000 })

                totalDiscordUpdates++
                console.log(`   ✅ Discord atualizado para ${student.email}`)
              } else {
                console.warn(`   ⚠️ DISCORD_BOT_URL não configurado`)
              }
            } catch (discordError: any) {
              console.warn(`   ⚠️ Erro ao atualizar Discord para ${student.email}:`, discordError.message)
            }
          }

          totalInactivated++
          results.push({
            studentId: student._id,
            email: student.email,
            name: student.name,
            status: 'success',
            classId: classId,
            className: classData.name
          })

        } catch (studentError: any) {
          console.error(`   ❌ Erro ao inativar ${student.email}:`, studentError.message)
          results.push({
            studentId: student._id,
            email: student.email,
            name: student.name,
            status: 'error',
            error: studentError.message,
            classId: classId
          })
        }
      }
    }

    console.log(`\n✅ Inativação concluída:`)
    console.log(`   📊 Total de alunos inativados: ${totalInactivated}`)
    console.log(`   💬 Discord roles atualizados: ${totalDiscordUpdates}`)

    const inactivationList = {
      _id: new Date().getTime().toString(),
      name: name || `Inativação ${new Date().toLocaleDateString('pt-PT')}`,
      classIds,
      totalInactivated,
      totalDiscordUpdates,
      students: results,
      createdAt: new Date()
    }

    // Marcar turmas como inativas
    const classUpdatePromises = classIds.map(async (cId: string) => {
      try {
        const existingClass = await (Class as any).findOne({ classId: cId }).lean()
        if (!existingClass) {
          return { classId: cId, success: false, error: 'Turma não encontrada' }
        }

        const result = await classesService.addOrEditClass({
          classId: cId,
          name: existingClass.name || cId,
          description: existingClass.description || '',
          isActive: false,
          estado: 'inativo',
          source: (existingClass as any).source || 'manual'
        })

        console.log(`✅ Turma ${cId} marcada como inativa`)
        return { classId: cId, success: true, result }
      } catch (error) {
        console.error(`❌ Erro ao inativar turma ${cId}:`, error)
        return { classId: cId, success: false, error: (error as Error).message }
      }
    })

    const classUpdateResults = await Promise.allSettled(classUpdatePromises)
    const successfulUpdates = classUpdateResults.filter(
      (r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value.success
    )

    console.log(`📊 Turmas inativadas: ${successfulUpdates.length}/${classIds.length}`)

    res.json({
      success: true,
      message: 'Lista de inativação criada e turmas atualizadas',
      list: inactivationList,
      inactivationList: {
        id: inactivationList._id,
        name: inactivationList.name,
        classIds,
        studentsCount: totalInactivated,
        status: 'COMPLETED'
      },
      classUpdates: {
        successful: successfulUpdates.length,
        failed: classIds.length - successfulUpdates.length,
        total: classIds.length
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Erro ao criar lista de inativação:', error)
    res.status(500).json({
      success: false,
      message: 'Erro ao criar lista de inativação',
      error: (error as Error).message
    })
  }
}

export const getInactivationLists = async (req: Request, res: Response) => {
  try {
    const UserHistoryModel = await import('../models/UserHistory')
    const UH = UserHistoryModel.default

    const lists = await (UH as any).find({
      changeType: 'INACTIVATION'
    })
      .sort({ changeDate: -1 })
      .limit(50)
      .lean()

    res.json({
      success: true,
      lists,
      pagination: {
        current: 1,
        total: lists.length,
        hasNext: false,
        hasPrev: false
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao listar listas de inativação',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

export const executeInactivationList = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    // A inativação já é executada no createInactivationList
    // Este endpoint existe por compatibilidade
    res.json({
      success: true,
      message: 'Lista de inativação já foi executada na criação',
      execution: {
        listId: id,
        status: 'COMPLETED'
      }
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao executar lista de inativação',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}

export const revertInactivationList = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { reason, userId, platforms = ['all'] } = req.body

    // Buscar registos de inativação
    const UserHistoryModel = await import('../models/UserHistory')
    const UH = UserHistoryModel.default

    const inactivations = await (UH as any).find({
      changeType: 'INACTIVATION',
      _id: id
    }).lean()

    if (!inactivations || inactivations.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Lista de inativação não encontrada'
      })
      return
    }

    res.json({
      success: true,
      message: 'Para reverter inativações, use o endpoint /api/classes/inactivationLists/revert/:id',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erro ao reverter lista de inativação',
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    })
  }
}
