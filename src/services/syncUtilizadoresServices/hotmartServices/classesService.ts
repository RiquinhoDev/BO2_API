// src/services/classesService.ts
import { Class, ClassHistory } from '../../../models/Class'
import { validateClassId, normalizeClassName } from '../../../models/Class'
import User from '../../../models/user' // 🔧 CORRIGIDO: Usar modelo User em vez de Student (lowercase!)

class ClassesService {
  async addOrEditClass(classData: {
    classId: string
    name: string
    description?: string
    isActive?: boolean
    estado?: 'ativo' | 'inativo'
    source?: string
  }) {
    try {
      const { classId, name, description, isActive = true, estado, source = 'manual' } = classData

      // Validações
      if (!validateClassId(classId)) {
        throw new Error('ID da turma inválido. Use apenas letras, números, hífens e underscores.')
      }

      const normalizedName = normalizeClassName(name)
      if (normalizedName.length < 3) {
        throw new Error('Nome da turma deve ter pelo menos 3 caracteres.')
      }

      // 🆕 DETERMINAR ESTADO FINAL baseado em prioridade
      const finalEstado = estado ?? (isActive ? 'ativo' : 'inativo')
      const finalIsActive = estado ? estado === 'ativo' : isActive

      // Verificar se já existe
      let existingClass = await Class.findOne({ classId })
      let isNew = false

      if (existingClass) {
        // ✅ CORRIGIDO: Atualizar turma existente SEM alterar o source
        existingClass.name = normalizedName
        if (description !== undefined) existingClass.description = description
        existingClass.isActive = finalIsActive
        existingClass.estado = finalEstado
        // ❌ REMOVIDO: NÃO sobrescrever source em edições
        // O source é definido na criação e não deve ser alterado depois
        // para evitar perder a associação com alunos (CursEduca vs Hotmart)
        
        await existingClass.save()
      } else {
        // Criar nova turma
        existingClass = new Class({
          classId,
          name: normalizedName,
          description,
          isActive: finalIsActive,
          estado: finalEstado,
          source,
          studentCount: 0
        })
        
        await existingClass.save()
        isNew = true
      }

      return {
        class: existingClass,
        isNew
      }
    } catch (error) {
      console.error('❌ Erro no serviço addOrEditClass:', error)
      throw error
    }
  }

  async getClassById(classId: string) {
    try {
      const cls = await Class.findOne({ classId }).lean()
      if (!cls) return null

      // ✅ CORRIGIDO: Contar alunos baseado na fonte da turma
      let studentCount = 0
      if (cls.source === 'curseduca_sync' && cls.curseducaUuid) {
        studentCount = await User.countDocuments({ 
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'combined.status': 'ACTIVE' 
        })
      } else {
        studentCount = await User.countDocuments({
          classId: cls.classId,
          status: 'ACTIVE'
        })
      }

      return {
        ...cls,
        studentCount
      }
    } catch (error) {
      console.error('❌ Erro no serviço getClassById:', error)
      throw error
    }
  }

  async deleteClass(classId: string) {
    try {
      const cls = await Class.findOne({ classId })
      if (!cls) {
        throw new Error('Turma não encontrada')
      }

      // Verificar se tem estudantes
      const studentCount = await User.countDocuments({
        classId,
        status: 'ACTIVE'
      })

      if (studentCount > 0) {
        throw new Error(`Não é possível remover turma com ${studentCount} estudante(s) ativo(s)`)
      }

      await Class.deleteOne({ classId })
      
      return { success: true }
    } catch (error) {
      console.error('❌ Erro no serviço deleteClass:', error)
      throw error
    }
  }

  async updateClassStudentCounts() {
    try {
      console.log('🔄 Atualizando contadores de estudantes...')
      
      const classes = await Class.find({}).lean()
      
      for (const cls of classes) {
        // ✅ CORRIGIDO: Contar baseado na fonte da turma
        let count = 0
        if (cls.source === 'curseduca_sync' && cls.curseducaUuid) {
          count = await User.countDocuments({
            'curseduca.groupCurseducaUuid': cls.curseducaUuid,
            'combined.status': 'ACTIVE'
          })
        } else {
          count = await User.countDocuments({
            classId: cls.classId,
            status: 'ACTIVE'
          })
        }
        
        await Class.updateOne(
          { classId: cls.classId },
          { studentCount: count }
        )
      }
      
      console.log(`✅ Contadores atualizados para ${classes.length} turmas`)
      return { updated: classes.length }
    } catch (error) {
      console.error('❌ Erro ao atualizar contadores:', error)
      throw error
    }
  }
}

export const classesService = new ClassesService()

// ===== SERVIÇO DE ESTUDANTES =====

class StudentService {
  async moveStudent(movement: {
    studentId: string
    fromClassId?: string
    toClassId: string
    reason?: string
    performedBy?: string
  }) {
    try {
      const { studentId, fromClassId, toClassId, reason, performedBy } = movement

      // Buscar estudante
      const student = await User.findById(studentId)
      if (!student) {
        throw new Error('Estudante não encontrado')
      }

      // Buscar turma de destino
      const toClass = await Class.findOne({ classId: toClassId })
      if (!toClass) {
        throw new Error('Turma de destino não encontrada')
      }

      // Salvar estado anterior
      const previousClassId = student.classId
      const previousClassName = student.className

      // Buscar nome da turma anterior se necessário
      let fromClassName: string | undefined
      if (previousClassId) {
        const fromClass = await Class.findOne({ classId: previousClassId })
        fromClassName = fromClass?.name || previousClassId
      }

      // Atualizar estudante
      student.classId = toClassId
      student.className = toClass.name
      await student.save()

      // Registrar no histórico
      const historyEntry = new ClassHistory({
        studentId: student._id.toString(),
        studentEmail: student.email,
        studentName: student.name,
        classId: toClassId,
        className: toClass.name,
        fromClassId: previousClassId,
        fromClassName,
        action: 'MOVE',
        reason: reason || 'Movimentação via API',
        performedBy,
        dateMoved: new Date()
      })

      await historyEntry.save()

      // Atualizar contadores das turmas
      if (previousClassId) {
        await this.updateClassStudentCount(previousClassId)
      }
      await this.updateClassStudentCount(toClassId)

      return historyEntry
    } catch (error) {
      console.error('❌ Erro no serviço moveStudent:', error)
      throw error
    }
  }

  async moveMultipleStudents(data: {
    studentIds: string[]
    toClassId: string
    reason?: string
    performedBy?: string
  }) {
    try {
      const { studentIds, toClassId, reason, performedBy } = data

      const results = {
        success: [] as any[],
        errors: [] as any[]
      }

      for (const studentId of studentIds) {
        try {
          const movement = await this.moveStudent({
            studentId,
            toClassId,
            reason,
            performedBy
          })

          results.success.push({
            studentId,
            movement
          })
        } catch (error) {
          results.errors.push({
            studentId,
            error: (error as Error).message
          })
        }
      }

      return results
    } catch (error) {
      console.error('❌ Erro no serviço moveMultipleStudents:', error)
      throw error
    }
  }

  private async updateClassStudentCount(classId: string) {
    try {
      // ✅ CORRIGIDO: Buscar turma para verificar fonte
      const cls = await Class.findOne({ classId }).lean()
      
      let count = 0
      if (cls && cls.source === 'curseduca_sync' && cls.curseducaUuid) {
        count = await User.countDocuments({
          'curseduca.groupCurseducaUuid': cls.curseducaUuid,
          'combined.status': 'ACTIVE'
        })
      } else {
        count = await User.countDocuments({
          classId,
          status: 'ACTIVE'
        })
      }

      await Class.updateOne(
        { classId },
        { studentCount: count }
      )

      return count
    } catch (error) {
      console.error('❌ Erro ao atualizar contador da turma:', error)
      throw error
    }
  }

}

export const studentService = new StudentService()
