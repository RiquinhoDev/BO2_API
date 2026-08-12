const mockCollectMetrics = jest.fn()
const mockLoggerInfo = jest.fn()

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: mockLoggerInfo, warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

jest.mock('../../src/services/metrics.service', () => ({
  __esModule: true,
  default: {
    collectMetrics: mockCollectMetrics,
  },
}))

jest.mock('../../src/services/notification.service', () => ({
  __esModule: true,
  default: {
    alertHighMemoryUsage: jest.fn(),
    alertHighCPUUsage: jest.fn(),
  },
}))

import systemMonitor from '../../src/services/systemMonitor.service'
import {
  resetRuntimeConfigForTests,
  useTestRuntimeConfig,
} from '../support/runtimeConfig'

const metrics = {
  cpu: { usage: 20, loadAverage: [0.2, 0.2, 0.2] },
  memory: {
    used: 20,
    total: 100,
    usagePercent: 20,
    heapUsed: 20,
    heapTotal: 100,
  },
  uptime: { process: 1, system: 2 },
  timestamp: new Date('2026-08-04T00:00:00.000Z'),
}

afterEach(() => {
  resetRuntimeConfigForTests()
  jest.restoreAllMocks()
  mockCollectMetrics.mockReset()
  mockLoggerInfo.mockReset()
})

test('system monitor uses typed metrics flag at check time instead of LOG_METRICS', async () => {
  useTestRuntimeConfig({ metricsEnabled: true })
  const previousMetricsFlag = process.env.LOG_METRICS
  process.env.LOG_METRICS = 'false'
  mockCollectMetrics.mockReturnValue(metrics)
  try {
    await (systemMonitor as unknown as { checkSystem: () => Promise<void> }).checkSystem()

    expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Métricas: CPU 20.0%, MEM 20.0%'))
  } finally {
    if (previousMetricsFlag === undefined) delete process.env.LOG_METRICS
    else process.env.LOG_METRICS = previousMetricsFlag
  }
})
