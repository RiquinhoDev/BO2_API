const mockProductFind = jest.fn()
const mockCreateSyncReport = jest.fn()

jest.mock('../../src/models', () => ({
  Product: {
    find: mockProductFind,
  },
  UserProduct: {},
}))

jest.mock('../../src/services/syncUtilizadoresServices/syncReports.service', () => ({
  __esModule: true,
  default: {
    createSyncReport: mockCreateSyncReport,
  },
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/models/SyncModels/SyncHistory', () => ({
  __esModule: true,
  default: {},
}))
jest.mock('../../src/models/Class', () => ({
  __esModule: true,
  Class: {},
}))


jest.mock('../../src/models/UserSnapshot', () => ({
  __esModule: true,
  default: {},
}))

import { executeUniversalSync } from '../../src/services/syncUtilizadoresServices/universalSync'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockProductFind.mockReset()
  mockCreateSyncReport.mockReset()
})

test('universal sync reads typed log level when the debug branch runs', async () => {
  useTestRuntimeConfig({ logLevel: 'debug' })
  const previousLogLevel = process.env.LOG_LEVEL
  process.env.LOG_LEVEL = 'info'
  mockProductFind.mockReturnValue({
    select: () => ({
      lean: jest.fn().mockResolvedValue([]),
    }),
  })
  mockCreateSyncReport.mockRejectedValue(new Error('stop before sync side effects'))
  const log = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)

  try {
    await expect(executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'runtime-config-boundary',
      triggeredBy: 'MANUAL',
      fullSync: true,
      includeProgress: false,
      includeTags: false,
      batchSize: 1,
      sourceData: [],
    })).rejects.toThrow('stop before sync side effects')

    expect(log).toHaveBeenCalledWith(expect.stringContaining('[ProductCache] Carregando produtos'))
  } finally {
    if (previousLogLevel === undefined) delete process.env.LOG_LEVEL
    else process.env.LOG_LEVEL = previousLogLevel
  }
})
