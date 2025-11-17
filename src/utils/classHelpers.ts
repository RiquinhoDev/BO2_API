// src/utils/classHelpers.ts - Utilitários para turmas
  import Class from '../models/Class'
import user from '../models/user'

  
  export class ClassHelper {
    static async getClassStats(classId: string) {
      const [
        totalStudents,
        activeStudents,
        blockedStudents,
        studentsWithProgress
      ] = await Promise.all([
        user.countDocuments({ classId }),
        user.countDocuments({ classId, status: 'ACTIVE' }),
        user.countDocuments({ classId, status: { $in: ['BLOCKED', 'BLOCKED_BY_OWNER'] } }),
        user.find({ classId, 'progress.completedPercentage': { $gt: 0 } })
      ])
  
      const avgProgress = studentsWithProgress.length > 0 
        ? studentsWithProgress.reduce((acc, student) => 
            acc + (student.progress?.completedPercentage || 0), 0
          ) / studentsWithProgress.length
        : 0
  
      return {
        totalStudents,
        activeStudents,
        blockedStudents,
        averageProgress: Math.round(avgProgress * 100) / 100,
        studentsWithProgress: studentsWithProgress.length,
        lastUpdate: new Date()
      }
    }
  
    static async validateClassExists(classId: string) {
      const classExists = await Class.findOne({ classId })
      return !!classExists
    }
  
    static async getClassNameById(classId: string) {
      const cls = await Class.findOne({ classId })
      return cls?.name || classId || "Turma não encontrada"
    }
  }