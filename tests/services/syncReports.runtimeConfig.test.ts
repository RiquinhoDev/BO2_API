const mockSyncReportCreate = jest.fn()
const mockUserCountDocuments = jest.fn()

jest.mock('../../src/models/SyncModels/SyncReport', () => ({
  __esModule: true,
  default: {
    create: mockSyncReportCreate,
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    countDocuments: mockUserCountDocuments,
  },
}))

import { createSyncReport } from '../../src/services/syncUtilizadoresServices/syncReports.service'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockSyncReportCreate.mockReset()
  mockUserCountDocuments.mockReset()
})

test('sync report metadata uses typed core environment and server version at call time', async () => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  useTestRuntimeConfig({
    nodeEnv: 'development',
    serverVersion: 'typed-version-3.2.1',
  })
  const previousNodeEnv = process.env.NODE_ENV
  const previousVersion = process.env.npm_package_version
  process.env.NODE_ENV = 'production'
  process.env.npm_package_version = 'ambient-version'
  mockUserCountDocuments.mockResolvedValueOnce(7).mockResolvedValueOnce(5)
  mockSyncReportCreate.mockResolvedValue({ _id: 'report-id' })

  try {
    await createSyncReport({
      jobName: 'runtime-config-boundary',
      syncType: 'hotmart',
      triggeredBy: 'MANUAL',
      syncConfig: {
        fullSync: true,
        includeProgress: false,
        includeTags: false,
        batchSize: 1,
      },
    })

    expect(mockSyncReportCreate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        environment: 'development',
        apiVersion: '3.0',
        serverVersion: 'typed-version-3.2.1',
      },
    }))
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousVersion === undefined) delete process.env.npm_package_version
    else process.env.npm_package_version = previousVersion
  }
})
