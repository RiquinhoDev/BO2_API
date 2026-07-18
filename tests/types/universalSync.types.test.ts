import type { UniversalSourceItem } from '../../src/types/universalSync.types'

describe('UniversalSourceItem progress contract', () => {
  it('carries the Hotmart module progress consumed by universal sync', () => {
    const item: UniversalSourceItem = {
      email: 'student@example.com',
      progress: {
        percentage: 50,
        modulesList: [
          {
            moduleId: 'module-1',
            name: 'Module 1',
            sequence: 1,
            totalPages: 10,
            completedPages: 5,
            isCompleted: false,
            isExtra: false,
            progressPercentage: 50,
            lastCompletedDate: 1_768_435_200_000,
          },
        ],
        totalModules: 1,
        modulesCompleted: [],
        currentModule: 1,
      },
    }

    expect(item.progress?.modulesList?.[0].moduleId).toBe('module-1')
    expect(item.progress?.totalModules).toBe(1)
    expect(item.progress?.modulesCompleted).toEqual([])
    expect(item.progress?.currentModule).toBe(1)
  })
})
