// src/services/classesService.ts
import { Class } from '../../../models/Class'
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
// Movement methods extracted to the studentMovement vertical; the empty
// service is kept only so the dead-adapter guard test can assert it exposes
// nothing until the double demolition removes this file entirely.

class StudentService {}

export const studentService = new StudentService()
