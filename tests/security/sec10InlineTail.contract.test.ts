import request from 'supertest'
import Transport from 'winston-transport'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'
import { configureDebugRoutes } from '../../src/security/debugRoutes'
import { createStructuredLogger } from '../../src/utils/logger'

const mockVerifyAppToken = jest.fn()
jest.mock('../../src/security/jwt', () => ({ verifyAppToken: mockVerifyAppToken }))

const mockUserProductFind = jest.fn()
jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: { find: mockUserProductFind, countDocuments: jest.fn() },
}))

const mockProductFind = jest.fn()
jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { find: mockProductFind },
}))

const mockValidationCount = jest.fn()
const mockValidationFind = jest.fn()
const mockValidationAggregate = jest.fn()
jest.mock('../../src/models/ValidationLog', () => ({
  __esModule: true,
  default: {
    countDocuments: mockValidationCount,
    find: mockValidationFind,
    aggregate: mockValidationAggregate,
  },
}))

import { createAuthenticate } from '../../src/middleware/auth.middleware'
import activecampaignRouter from '../../src/routes/ACroutes/activecampaign.routes'
import usersRouter from '../../src/routes/users.routes'
import validationLogsRouter from '../../src/routes/validationLogs.routes'

class MemoryTransport extends Transport {
  readonly events: Array<Record<string, unknown>> = []

  log(info: Record<string, unknown>, next: () => void): void {
    this.events.push(info)
    next()
  }
}

const secret = new Error('secret alice@example.test token=hidden')

describe('SEC-10 inline route tail boundary', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    configureDebugRoutes({ enableDebugRoutes: true })
    mockValidationFind.mockReturnValue({
      select: () => ({
        sort: () => ({
          skip: () => ({ limit: () => ({ lean: async () => [] }) }),
        }),
      }),
    })
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    configureDebugRoutes({ enableDebugRoutes: false })
    jest.restoreAllMocks()
  })

  it('auth forwards one fatal failure without a local error log', async () => {
    mockVerifyAppToken.mockImplementationOnce(() => { throw secret })
    const transport = new MemoryTransport()
    const logger = createStructuredLogger({ level: 'debug', transports: [transport] })
    const authenticate = createAuthenticate(logger)

    const response = await request(appForCentralError({ kind: 'handler', handler: authenticate, path: '/protected' }))
      .get('/protected?__bo2_offline_loopback=1')
      .set('Authorization', 'Bearer opaque-token')

    expectCentralError(response, {
      code: 'AUTHENTICATION_FAILED',
      message: 'Erro na autenticação',
    })
    expect(transport.events.filter((event) => event.level === 'error')).toHaveLength(0)
    logger.close()
  })

  const routeOperations = [
    {
      name: 'users engagement heatmap',
      router: usersRouter,
      path: '/engagement/heatmap',
      arrange: () => mockUserProductFind.mockImplementationOnce(() => { throw secret }),
      code: 'USERS_ENGAGEMENT_HEATMAP_FAILED',
      message: 'Erro ao gerar heatmap de engagement',
    },
    {
      name: 'validation log listing',
      router: validationLogsRouter,
      path: '/logs',
      arrange: () => mockValidationCount.mockRejectedValueOnce(secret),
      code: 'VALIDATION_LOGS_LIST_ERROR',
      message: 'Erro ao listar logs de validação.',
    },
    {
      name: 'validation log stats',
      router: validationLogsRouter,
      path: '/logs/stats',
      arrange: () => mockValidationAggregate.mockRejectedValue(secret),
      code: 'VALIDATION_LOGS_STATS_ERROR',
      message: 'Erro ao carregar estatísticas de validação.',
    },
  ]

  it.each(routeOperations)('$name uses the central envelope', async (operation) => {
    operation.arrange()
    const response = await request(appForCentralError({ kind: 'router', router: operation.router, mountPath: '/' }))
      .get(`${operation.path}?__bo2_offline_loopback=1`)

    expectCentralError(response, { code: operation.code, message: operation.message })
  })
})
