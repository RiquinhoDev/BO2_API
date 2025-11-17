// src/utils/historyHelpers.ts - Utilitários para histórico
  import StudentClassHistory from '../models/StudentClassHistory'
  
  export class HistoryHelper {
    static async recordClassChange(
      studentId: string,
      fromClassId: string | null,
      fromClassName: string,
      toClassId: string,
      toClassName: string,
      reason?: string,
      movedBy?: string
    ) {
      const historyEntry = new StudentClassHistory({
        studentId,
        classId: fromClassId || 'sem-turma',
        className: fromClassName,
        dateMoved: new Date(),
        reason: reason || 'Movimentação manual',
        movedBy,
        previousClassId: fromClassId,
        previousClassName: fromClassName
      })
  
      return await historyEntry.save()
    }
  
    static async getStudentClassHistory(studentId: string, limit = 20) {
      return await StudentClassHistory.find({ studentId })
        .sort({ dateMoved: -1 })
        .limit(limit)
        .populate('studentId', 'name email')
    }
  
    static async getClassHistory(classId: string, limit = 50) {
      return await StudentClassHistory.find({ classId })
        .sort({ dateMoved: -1 })
        .limit(limit)
        .populate('studentId', 'name email')
    }
  }