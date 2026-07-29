import {
  ClassQuickStatsService,
  type ClassQuickStatsCounts,
  type ClassQuickStatsReader,
} from '../../../src/services/analytics/classQuickStats.service'

class FixedCountsReader implements ClassQuickStatsReader {
  constructor(private readonly counts: ClassQuickStatsCounts) {}

  async countByClass(): Promise<ClassQuickStatsCounts> {
    return this.counts
  }
}

describe('ClassQuickStatsService', () => {
  it('derives inactive students and the rounded activity rate', async () => {
    const service = new ClassQuickStatsService(
      new FixedCountsReader({
        totalStudents: 3,
        activeStudents: 2,
      }),
    )

    await expect(service.get('class-1')).resolves.toEqual({
      classId: 'class-1',
      totalStudents: 3,
      activeStudents: 2,
      inactiveStudents: 1,
      activityRate: 67,
    })
  })

  it('preserves the empty-class result without synthetic percentages', async () => {
    const service = new ClassQuickStatsService(
      new FixedCountsReader({
        totalStudents: 0,
        activeStudents: 0,
      }),
    )

    await expect(service.get('class-empty')).resolves.toEqual({
      classId: 'class-empty',
      totalStudents: 0,
      activeStudents: 0,
      message: 'Turma sem alunos',
    })
  })
})
