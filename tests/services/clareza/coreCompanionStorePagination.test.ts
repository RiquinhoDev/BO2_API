const earningsFind = jest.fn()
const raioxFind = jest.fn()
const top10Find = jest.fn()

jest.mock('../../../src/models/ClarezaCoreEarningsCompanion', () => ({
  __esModule: true,
  default: { find: earningsFind },
}))
jest.mock('../../../src/models/ClarezaCoreRaioxCompanion', () => ({
  __esModule: true,
  default: { find: raioxFind },
}))
jest.mock('../../../src/models/ClarezaCoreTop10Companion', () => ({
  __esModule: true,
  default: { find: top10Find },
}))

import { MongooseCoreEarningsCompanionStore } from '../../../src/services/clareza/core/coreEarningsCompanionStore'
import { MongooseCoreRaioxCompanionStore } from '../../../src/services/clareza/core/coreRaioxCompanionStore'
import { MongooseCoreTop10CompanionStore } from '../../../src/services/clareza/core/coreTop10CompanionStore'

function cursorQuery(rows: readonly Record<string, unknown>[]) {
  const cursor = (async function * () {
    for (const row of rows) yield row
  })()
  const query = {
    sort: jest.fn(),
    maxTimeMS: jest.fn(),
    lean: jest.fn(),
    cursor: jest.fn().mockReturnValue(cursor),
  }
  query.sort.mockReturnValue(query)
  query.maxTimeMS.mockReturnValue(query)
  query.lean.mockReturnValue(query)
  return query
}

describe('canonical companion store pagination', () => {
  beforeEach(() => jest.clearAllMocks())

  it('streams every earnings row in stable batches without truncating a generation', async () => {
    const rows = [
      { ticker: '__META__', createdAt: new Date(), failures: [] },
      ...Array.from({ length: 250 }, (_, i) => ({ ticker: `E${i}`, events: [] })),
    ]
    const query = cursorQuery(rows)
    earningsFind.mockReturnValue(query)

    const found = await new MongooseCoreEarningsCompanionStore().read('generation-a')

    expect(found?.series).toHaveLength(250)
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 })
    expect(query.cursor).toHaveBeenCalledWith({ batchSize: 200 })
  })

  it('streams every Raio-X row in stable batches without truncating a generation', async () => {
    const rows = [
      { ticker: '__META__', sectorPe: [] },
      ...Array.from({ length: 250 }, (_, i) => ({ ticker: `R${i}`, data: { i } })),
    ]
    const query = cursorQuery(rows)
    raioxFind.mockReturnValue(query)

    const found = await new MongooseCoreRaioxCompanionStore().read('generation-a')

    expect(Object.keys(found?.companions ?? {})).toHaveLength(250)
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 })
    expect(query.cursor).toHaveBeenCalledWith({ batchSize: 200 })
  })

  it('streams every Top 10 row in stable batches without truncating a generation', async () => {
    const rows = [
      { ticker: '__META__', createdAt: new Date(), failures: [] },
      ...Array.from({ length: 250 }, (_, i) => ({ ticker: `T${i}`, points: [] })),
    ]
    const query = cursorQuery(rows)
    top10Find.mockReturnValue(query)

    const found = await new MongooseCoreTop10CompanionStore().read('generation-a')

    expect(found?.histories).toHaveLength(250)
    expect(query.sort).toHaveBeenCalledWith({ _id: 1 })
    expect(query.cursor).toHaveBeenCalledWith({ batchSize: 200 })
  })
})
