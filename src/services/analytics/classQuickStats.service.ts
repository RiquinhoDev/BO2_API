export interface ClassQuickStatsCounts {
  totalStudents: number
  activeStudents: number
}

export interface ClassQuickStatsReader {
  countByClass(classId: string): Promise<ClassQuickStatsCounts>
}

export type ClassQuickStatsResult =
  | {
      classId: string
      totalStudents: 0
      activeStudents: 0
      message: 'Turma sem alunos'
    }
  | {
      classId: string
      totalStudents: number
      activeStudents: number
      inactiveStudents: number
      activityRate: number
    }

export class ClassQuickStatsService {
  constructor(private readonly reader: ClassQuickStatsReader) {}

  async get(classId: string): Promise<ClassQuickStatsResult> {
    const { totalStudents, activeStudents } =
      await this.reader.countByClass(classId)

    if (totalStudents === 0) {
      return {
        classId,
        totalStudents: 0,
        activeStudents: 0,
        message: 'Turma sem alunos',
      }
    }

    return {
      classId,
      totalStudents,
      activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      activityRate: Math.round((activeStudents / totalStudents) * 100),
    }
  }
}
