import {
  ClassDirectoryService,
  type ClassDirectoryReader,
  type Clock,
  type DirectoryClass,
} from '../../../src/services/classes/classDirectory.service'

const FIXED = new Date('2026-01-02T03:04:05.000Z')
const fixedClock: Clock = { now: () => FIXED }

const makeReader = (classes: DirectoryClass[], total = classes.length): ClassDirectoryReader => ({
  listClasses: jest.fn(async () => ({ classes, total })),
})

describe('ClassDirectoryService', () => {
  it('stamps the injected clock exactly on the list envelope', async () => {
    const service = new ClassDirectoryService(makeReader([]), fixedClock)
    const result = await service.list({ limit: 100, offset: 0, sortBy: 'name', sortOrder: 'asc' })
    expect(result.timestamp).toBe('2026-01-02T03:04:05.000Z')
  })

  it('simplifies with name/estado fallbacks and requests the internal limit 1000', async () => {
    const reader = makeReader([
      { classId: 'Z', isActive: true, studentCount: 0 } as DirectoryClass,
    ])
    const service = new ClassDirectoryService(reader, fixedClock)

    const simple = await service.simpleList()
    expect(simple).toEqual([
      { classId: 'Z', name: 'Z', isActive: true, estado: 'ativo', studentCount: 0, description: '' },
    ])
    expect(reader.listClasses).toHaveBeenCalledWith({ limit: 1000, offset: 0, sortBy: 'name', sortOrder: 'asc' })
  })
})
