const mockBulk = jest.fn()
const mockGenerate = jest.fn()
const mockOwnership = jest.fn()
const mockModels = Object.fromEntries(['sales', 'tags', 'ac', 'users', 'moves', 'timelines', 'exceptions'].map(key => [key, { find: jest.fn() }]))
jest.mock('../../../../src/models/HotmartSaleHistory', () => ({ __esModule: true, default: mockModels.sales }))
jest.mock('../../../../src/models/ACStudentTag', () => ({ __esModule: true, default: mockModels.tags }))
jest.mock('../../../../src/models/ACRenewalData', () => ({ __esModule: true, default: mockModels.ac }))
jest.mock('../../../../src/models/StudentClassHistory', () => ({ __esModule: true, default: mockModels.moves }))
jest.mock('../../../../src/models/StudentRenewalTimeline', () => ({ __esModule: true, default: { ...mockModels.timelines, bulkWrite: mockBulk } }))
jest.mock('../../../../src/models/TurmaTagMap', () => ({ __esModule: true, default: mockModels.exceptions }))
jest.mock('../../../../src/models', () => ({ User: mockModels.users }))
jest.mock('../../../../src/services/renewal/renewalTimeline.generator', () => ({ gerarTimeline: mockGenerate }))
jest.mock('../../../../src/services/renewal/mainParityExecution', () => ({
  ...jest.requireActual('../../../../src/services/renewal/mainParityExecution'),
  assertMainParityOwnership: mockOwnership,
  mainParityLocalMutationStarted: mockOwnership,
}))

import { gerarTimelinesEmLote } from '../../../../src/services/renewal/renewalTimeline.service'

const closes: jest.Mock[] = []
function documents(key: string, rows: Record<string, unknown>[]) {
  mockModels[key].find.mockImplementation((filter: Record<string, { $in?: unknown[] }>) => {
    const selected = rows.filter(row => Object.entries(filter).every(([field, condition]) => !condition.$in || condition.$in.includes(row[field])))
    const close = jest.fn(); closes.push(close)
    const chain = { select: jest.fn(), sort: jest.fn(), maxTimeMS: jest.fn(), lean: jest.fn(), exec: async () => selected,
      cursor: jest.fn(() => ({ async *[Symbol.asyncIterator]() { yield* selected }, close })) }
    for (const method of [chain.select, chain.sort, chain.maxTimeMS, chain.lean]) method.mockReturnValue(chain)
    return chain
  })
}
beforeEach(() => {
  jest.resetAllMocks(); closes.length = 0
  for (const key of Object.keys(mockModels)) documents(key, [])
  documents('sales', [{ email: 'one@test.invalid', sales: [] }, { email: 'two@test.invalid', sales: [] }])
  documents('users', [{ _id: 'one', email: 'one@test.invalid' }, { _id: 'two', email: 'two@test.invalid' }])
  mockGenerate.mockReturnValue({ ciclos: [], turmasPorMapear: [], tagsOrfas: [], tagsDuplicadas: [], tagsEstado: [], cadeia: {} })
  mockBulk.mockImplementation(async (ops: unknown[]) => ({ matchedCount: ops.length, upsertedCount: 0 }))
})
test('generation error prevents publishing a partial cohort', async () => {
  mockGenerate.mockImplementationOnce(() => { throw new Error('invalid source') })
  await expect(gerarTimelinesEmLote()).rejects.toThrow(/incomplete|incompleta/i)
  expect(mockBulk).not.toHaveBeenCalled()
})
test('lost ownership prevents local mutation', async () => {
  mockOwnership.mockImplementation(() => { throw new Error('lease lost') })
  await expect(gerarTimelinesEmLote()).rejects.toThrow('lease lost')
  expect(mockBulk).not.toHaveBeenCalled()
})
test('complete cohort over one batch is published in bounded ordered batches', async () => {
  const rows = Array.from({ length: 251 }, (_, index) => ({ _id: String(index), email: `${index}@test.invalid`, sales: [] }))
  documents('sales', rows); documents('users', rows)
  expect((await gerarTimelinesEmLote()).gerados).toBe(251)
  expect(mockBulk.mock.calls.map(([ops]) => ops.length)).toEqual([200, 51])
  expect(mockBulk.mock.calls.every(([, options]) => options.ordered === true)).toBe(true)
  expect(closes.every(close => close.mock.calls.length === 1)).toBe(true)
})
test('oversized complete cohort fails before publication', async () => {
  documents('sales', Array.from({ length: 20001 }, (_, index) => ({ email: `${index}@test.invalid`, sales: [] })))
  await expect(gerarTimelinesEmLote()).rejects.toThrow(/cap|limit/i)
  expect(mockBulk).not.toHaveBeenCalled()
})
