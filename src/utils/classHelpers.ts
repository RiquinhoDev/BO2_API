// src/utils/classHelpers.ts

import { Class } from '../models'
import User, { IUser } from '../models/user'

export class ClassHelper {
  static async getClassStats(classId: string) {
    const [
      totalStudents,
      activeStudents,
      blockedStudents,
      studentsWithProgress
    ] = await Promise.all([
      User.countDocuments({ 'combined.classId': classId }),
      User.countDocuments({ 'combined.classId': classId, 'combined.status': 'ACTIVE' }),
      User.countDocuments({ 'combined.classId': classId, 'combined.status': { $in: ['BLOCKED', 'BLOCKED_BY_OWNER'] } }),
      User.find({ 'combined.classId': classId, 'combined.totalProgress': { $gt: 0 } })
        .select({ combined: 1 })
        .lean()
    ])

    const avgProgress = studentsWithProgress.length > 0
      ? studentsWithProgress.reduce((acc, student) =>
          acc + (student.combined?.totalProgress || 0), 0
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
    return cls?.name || classId || 'Turma não encontrada'
  }
}
