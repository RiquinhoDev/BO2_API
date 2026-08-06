// src/services/classesService.ts
import { Class, ClassHistory } from '../../../models/Class'
import User from '../../../models/user' // 🔧 CORRIGIDO: Usar modelo User em vez de Student (lowercase!)

class ClassesService {
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
