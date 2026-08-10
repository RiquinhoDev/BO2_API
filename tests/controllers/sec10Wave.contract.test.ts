import type { NextFunction, Response } from 'express'
import { Router } from 'express'
import request from 'supertest'
import { asyncRoute, type AsyncRouteHandler } from '../../src/security/asyncRoute'
import type { ValidatedRequest } from '../../src/security/validatedInput'

type AsyncBoundaryMock = jest.Mock<Promise<unknown>, unknown[]>
type ChainBoundaryMock = jest.Mock<Record<string, unknown>, unknown[]>
type HybridBoundaryMock = jest.Mock<
  Promise<unknown> | Record<string, unknown>,
  unknown[]
>

const mockACContactStateFindOne: AsyncBoundaryMock = jest.fn()
const mockACContactStateDeleteMany: AsyncBoundaryMock = jest.fn()
const mockCourseFindOne: AsyncBoundaryMock = jest.fn()
const mockCourseFindById: AsyncBoundaryMock = jest.fn()
const mockTagRuleFind: ChainBoundaryMock = jest.fn()
const mockTagRuleFindById: HybridBoundaryMock = jest.fn()
const mockTagRuleFindByIdAndUpdate: AsyncBoundaryMock = jest.fn()
const mockIndexedUserProductFind: ChainBoundaryMock = jest.fn()
const mockIndexedUserProductCountDocuments: AsyncBoundaryMock = jest.fn()
const mockUserFindOne: ChainBoundaryMock = jest.fn()
const mockUserFindById: AsyncBoundaryMock = jest.fn()
const mockUserCountDocuments: AsyncBoundaryMock = jest.fn()
const mockProductFind: ChainBoundaryMock = jest.fn()
const mockProductFindById: AsyncBoundaryMock = jest.fn()
const mockUserProductFindOne: AsyncBoundaryMock = jest.fn()
const mockHistoryFind: ChainBoundaryMock = jest.fn()
const mockHistoryCountDocuments: AsyncBoundaryMock = jest.fn()
const mockHistoryAggregate: AsyncBoundaryMock = jest.fn()
const mockLegacyTagRuleFind: ChainBoundaryMock = jest.fn()
const mockLegacyTagRuleFindByIdAndUpdate: AsyncBoundaryMock = jest.fn()
const mockLegacyTagRuleFindByIdAndDelete: AsyncBoundaryMock = jest.fn()
const mockLegacyTagRuleSave: AsyncBoundaryMock = jest.fn()
const mockLegacyTagRule = Object.assign(
  jest.fn<Record<string, unknown>, [unknown]>(),
  {
    find: mockLegacyTagRuleFind,
    findByIdAndUpdate: mockLegacyTagRuleFindByIdAndUpdate,
    findByIdAndDelete: mockLegacyTagRuleFindByIdAndDelete,
  },
)
mockLegacyTagRule.prototype.save = mockLegacyTagRuleSave
const mockCronExecutionLogFind: ChainBoundaryMock = jest.fn()
const mockCronExecutionLogCreate: AsyncBoundaryMock = jest.fn()
const mockContactTagReaderGetTags: AsyncBoundaryMock = jest.fn()

jest.mock('../../src/models', () => ({
  ACContactState: {
    findOne: mockACContactStateFindOne,
    deleteMany: mockACContactStateDeleteMany,
  },
  Course: {
    findOne: mockCourseFindOne,
    findById: mockCourseFindById,
  },
  Product: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
  TagRule: {
    find: mockTagRuleFind,
    findById: mockTagRuleFindById,
    create: jest.fn(),
    findByIdAndUpdate: mockTagRuleFindByIdAndUpdate,
  },
  UserProduct: {
    findOne: jest.fn(),
    find: mockIndexedUserProductFind,
    countDocuments: mockIndexedUserProductCountDocuments,
    aggregate: jest.fn(),
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
    findById: mockUserFindById,
    countDocuments: mockUserCountDocuments,
  },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    findById: mockProductFindById,
    find: mockProductFind,
  },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: mockUserProductFindOne,
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}))

jest.mock('../../src/models/acTags/CommunicationHistory', () => ({
  __esModule: true,
  default: {
    find: mockHistoryFind,
    countDocuments: mockHistoryCountDocuments,
    aggregate: mockHistoryAggregate,
  },
}))

jest.mock('../../src/models/acTags/TagRule', () => ({
  __esModule: true,
  default: mockLegacyTagRule,
}))

jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: {
    find: mockCronExecutionLogFind,
    create: mockCronExecutionLogCreate,
  },
}))

jest.mock('../../src/services/activeCampaign/contactTagReader.service', () => ({
  __esModule: true,
  default: { getContactTags: mockContactTagReaderGetTags },
}))

jest.mock('../../src/services/activeCampaign/decisionEngine.service', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: {},
}))

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}))
import {
  batchSyncContacts,
  clearACCache,
  getBatchContactTags,
  getContactTags,
  syncContactTags,
} from '../../src/controllers/acTags/acReader.controller'
import {
  evaluateClarezaRules,
  evaluateOGIRules,
  getClarezaStudents,
  getOGIStudents,
} from '../../src/controllers/acTags/activeCampaignCourse.controller'
import { getCommunicationHistory } from '../../src/controllers/acTags/activeCampaignHistoryList.controller'
import { getHistoryStats } from '../../src/controllers/acTags/activeCampaignHistoryStats.controller'
import {
  createTagRule,
  deleteTagRule,
  getAllTagRules,
  updateTagRule,
} from '../../src/controllers/acTags/activeCampaignLegacyTagRules.controller'
import { getCronLogs, getStats, testCron } from '../../src/controllers/acTags/activeCampaignOps.controller'
import {
  applyTagToUserProduct,
  getACStats,
  getUsersWithTagsInProduct,
  removeTagFromUserProduct,
  syncProductTags,
} from '../../src/controllers/acTags/activeCampaignProductTags.controller'
import {
  createRule,
  deleteRule,
  getAllRules,
  getRuleById,
  testRule,
  updateRule,
} from '../../src/controllers/acTags/tagRule.controller'
import {
  estimateAffectedUsers,
  getAvailableFields,
  previewAffectedUsers,
} from '../../src/controllers/acTags/tagRuleEstimate.controller'
import {
  appForCentralError,
  expectCentralError,
  type CentralErrorRoute,
  type ExpectedCentralError,
} from '../support/centralErrorContract'

const secret = new Error('secret alice@example.test token=hidden')
const offline = '?__bo2_offline_loopback=1'

describe('SEC-10 central error contract harness', () => {
  const routes: readonly [string, CentralErrorRoute, string][] = [
    [
      'an async handler',
      { kind: 'handler', method: 'get', path: '/target', handler: async () => { throw secret } },
      '/target',
    ],
    [
      'an Express router',
      {
        kind: 'router',
        mountPath: '/target',
        router: (() => {
          const router = Router()
          router.get('/', () => { throw secret })
          return router
        })(),
      },
      '/target/',
    ],
  ]

  it.each(routes)('mounts %s behind the central error boundary', async (_name, route, path) => {
    const response = await request(appForCentralError(route)).get(path + offline)

    expectCentralError(response, {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
    })
  })

  it('uses the supplied deterministic correlation ID', async () => {
    const response = await request(appForCentralError({
      kind: 'handler',
      handler: async () => { throw secret },
    }, 'sec10-deterministic-request')).get('/target' + offline)

    expectCentralError(response, {
      code: 'INTERNAL_ERROR',
      message: 'Erro interno do servidor',
      correlationId: 'sec10-deterministic-request',
    })
  })
})

type HandlerRoute = Extract<CentralErrorRoute, { kind: 'handler' }>
type ValidatedInput = {
  params: object
  query: object
  body: object
}
type ValidatedController<TInput extends ValidatedInput> = (
  input: TInput,
  req: ValidatedRequest,
  res: Response,
  next: NextFunction,
) => Promise<void>
type WaveOperation = {
  name: string
  route: CentralErrorRoute
  arrange: () => void
  expected: ExpectedCentralError
  body?: object
  path?: string
}

const requestHandler = (handler: AsyncRouteHandler): HandlerRoute => ({
  kind: 'handler',
  method: 'post',
  handler,
})

const validatedHandler = <TInput extends ValidatedInput>(
  handler: ValidatedController<TInput>,
  input: TInput,
): HandlerRoute =>
  requestHandler((req, res, next) => handler(input, req, res, next))

const contactHandler = (
  handler: AsyncRouteHandler<{ email: string }>,
): CentralErrorRoute => {
  const router = Router()
  router.post('/target/:email', asyncRoute(handler))
  return { kind: 'router', mountPath: '/', router }
}

const rejectSelectedLean = (): void => {
  mockUserFindOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockRejectedValue(secret),
    }),
  })
}

let consoleLogSpy: jest.SpiedFunction<typeof console.log>

const operations: WaveOperation[] = [
  {
    name: 'read contact tags',
    route: contactHandler(getContactTags),
    arrange: () => { mockACContactStateFindOne.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CONTACT_TAGS_READ_FAILED', message: 'Erro interno do servidor' },
    path: '/target/alice@example.test',
  },
  {
    name: 'sync contact tags',
    route: contactHandler(syncContactTags),
    arrange: () => rejectSelectedLean(),
    expected: { code: 'AC_CONTACT_TAGS_SYNC_FAILED', message: 'Erro interno do servidor' },
    path: '/target/alice@example.test',
  },
  {
    name: 'batch read contact tags',
    route: requestHandler(getBatchContactTags),
    arrange: () => { mockContactTagReaderGetTags.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CONTACT_TAGS_BATCH_READ_FAILED', message: 'Erro interno do servidor' },
    body: { emails: ['alice@example.test'] },
  },
  {
    name: 'batch sync contact tags',
    route: requestHandler(batchSyncContacts),
    arrange: () => rejectSelectedLean(),
    expected: { code: 'AC_CONTACT_TAGS_BATCH_SYNC_FAILED', message: 'Erro interno do servidor' },
    body: { emails: ['alice@example.test'] },
  },
  {
    name: 'clear contact cache',
    route: requestHandler(clearACCache),
    arrange: () => { mockACContactStateDeleteMany.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CONTACT_CACHE_CLEAR_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'read Clareza students',
    route: requestHandler(getClarezaStudents),
    arrange: () => { mockCourseFindOne.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CLAREZA_STUDENTS_READ_FAILED', message: 'Erro ao buscar alunos' },
  },
  {
    name: 'preview Clareza rules',
    route: requestHandler(evaluateClarezaRules),
    arrange: () => { mockCourseFindOne.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CLAREZA_RULES_PREVIEW_FAILED', message: 'Erro ao pré-visualizar regras' },
  },
  {
    name: 'read OGI students',
    route: requestHandler(getOGIStudents),
    arrange: () => { mockCourseFindOne.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_OGI_STUDENTS_READ_FAILED', message: 'Erro ao buscar alunos' },
  },
  {
    name: 'preview OGI rules',
    route: requestHandler(evaluateOGIRules),
    arrange: () => { mockCourseFindOne.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_OGI_RULES_PREVIEW_FAILED', message: 'Erro ao pré-visualizar regras' },
  },
  {
    name: 'list communication history',
    route: requestHandler(getCommunicationHistory),
    arrange: () => {
      const chain = {
        populate: jest.fn(), sort: jest.fn(), skip: jest.fn(), limit: jest.fn(),
        lean: jest.fn().mockRejectedValue(secret),
      }
      chain.populate.mockReturnValue(chain)
      chain.sort.mockReturnValue(chain)
      chain.skip.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      mockHistoryFind.mockReturnValue(chain)
      mockHistoryCountDocuments.mockResolvedValue(0)
    },
    expected: { code: 'AC_HISTORY_LIST_FAILED', message: 'Erro ao buscar histórico' },
  },
  {
    name: 'read communication history stats',
    route: requestHandler(getHistoryStats),
    arrange: () => { mockHistoryAggregate.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_HISTORY_STATS_FAILED', message: 'Erro ao calcular estatísticas' },
  },
  {
    name: 'list legacy tag rules',
    route: requestHandler(getAllTagRules),
    arrange: () => {
      mockLegacyTagRuleFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockRejectedValue(secret),
        }),
      })
    },
    expected: { code: 'AC_LEGACY_TAG_RULE_LIST_FAILED', message: 'Erro ao buscar regras' },
  },
  {
    name: 'create legacy tag rule',
    route: requestHandler(createTagRule),
    arrange: () => { mockLegacyTagRuleSave.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_LEGACY_TAG_RULE_CREATE_FAILED', message: 'Erro ao criar regra' },
  },
  {
    name: 'update legacy tag rule',
    route: requestHandler(updateTagRule),
    arrange: () => { mockLegacyTagRuleFindByIdAndUpdate.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_LEGACY_TAG_RULE_UPDATE_FAILED', message: 'Erro ao atualizar regra' },
  },
  {
    name: 'delete legacy tag rule',
    route: validatedHandler(deleteTagRule, {
      params: { id: '507f1f77bcf86cd799439011' }, query: {}, body: {},
    }),
    arrange: () => { mockLegacyTagRuleFindByIdAndDelete.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_LEGACY_TAG_RULE_DELETE_FAILED', message: 'Erro ao deletar regra' },
  },
  {
    name: 'run manual ActiveCampaign evaluation',
    route: validatedHandler(testCron, { params: {}, query: {}, body: {} }),
    arrange: () => {
      mockProductFind.mockReturnValue({
        populate: jest.fn().mockRejectedValue(secret),
      })
      mockCronExecutionLogCreate.mockResolvedValue({})
    },
    expected: { code: 'AC_MANUAL_EVALUATION_FAILED', message: 'Erro na avaliação manual' },
  },
  {
    name: 'list ActiveCampaign cron logs',
    route: requestHandler(getCronLogs),
    arrange: () => {
      mockCronExecutionLogFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockRejectedValue(secret),
        }),
      })
    },
    expected: { code: 'AC_CRON_LOGS_READ_FAILED', message: 'Erro ao buscar cron logs' },
  },
  {
    name: 'read ActiveCampaign stats',
    route: requestHandler(getStats),
    arrange: () => { mockUserCountDocuments.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas' },
  },
  {
    name: 'apply product tag',
    route: validatedHandler(applyTagToUserProduct, {
      params: {}, query: {}, body: {
        userId: '507f1f77bcf86cd799439011',
        productId: '507f191e810c19729de860ea',
        tagName: 'TAG',
      },
    }),
    arrange: () => { mockUserFindById.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAG_APPLY_FAILED', message: 'Erro ao aplicar tag' },
  },
  {
    name: 'remove product tag',
    route: validatedHandler(removeTagFromUserProduct, {
      params: {}, query: {}, body: {
        userId: '507f1f77bcf86cd799439011',
        productId: '507f191e810c19729de860ea',
        tagName: 'TAG',
      },
    }),
    arrange: () => { mockUserProductFindOne.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAG_REMOVE_FAILED', message: 'Erro ao remover tag' },
  },
  {
    name: 'read product tagged users',
    route: requestHandler(getUsersWithTagsInProduct),
    arrange: () => { mockProductFindById.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAGGED_USERS_READ_FAILED', message: 'Erro ao buscar tags do produto' },
  },
  {
    name: 'read product tag stats',
    route: requestHandler(getACStats),
    arrange: () => {
      mockProductFind.mockReturnValue({
        lean: jest.fn().mockRejectedValue(secret),
      })
    },
    expected: { code: 'AC_PRODUCT_TAG_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas AC' },
  },
  {
    name: 'sync product tags',
    route: validatedHandler(syncProductTags, {
      params: { productId: '507f191e810c19729de860ea' }, query: {}, body: {},
    }),
    arrange: () => { mockProductFindById.mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAG_SYNC_FAILED', message: 'Erro ao sincronizar tags' },
  },
  {
    name: 'list tag rules',
    route: requestHandler(getAllRules),
    arrange: () => {
      mockTagRuleFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockRejectedValue(secret),
        }),
      })
    },
    expected: { code: 'TAG_RULE_LIST_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'read tag rule',
    route: requestHandler(getRuleById),
    arrange: () => {
      mockTagRuleFindById.mockReturnValue({
        populate: jest.fn().mockRejectedValue(secret),
      })
    },
    expected: { code: 'TAG_RULE_READ_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'create tag rule',
    route: requestHandler(createRule),
    arrange: () => { mockCourseFindById.mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_CREATE_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'update tag rule',
    route: requestHandler(updateRule),
    arrange: () => { mockTagRuleFindByIdAndUpdate.mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_UPDATE_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'delete tag rule',
    route: requestHandler(deleteRule),
    arrange: () => { mockTagRuleFindByIdAndUpdate.mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_DELETE_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'test tag rule dry-run',
    route: requestHandler(testRule),
    arrange: () => { mockTagRuleFindById.mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_TEST_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'estimate affected tag-rule users',
    route: requestHandler(estimateAffectedUsers),
    arrange: () => { mockIndexedUserProductCountDocuments.mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_ESTIMATE_FAILED', message: 'Erro interno do servidor' },
    body: { conditions: { source: 'USERPRODUCT', rules: [] } },
  },
  {
    name: 'preview affected tag-rule users',
    route: requestHandler(previewAffectedUsers),
    arrange: () => {
      const chain = { limit: jest.fn(), populate: jest.fn(), sort: jest.fn() }
      chain.limit.mockReturnValue(chain)
      chain.populate.mockReturnValue(chain)
      chain.sort.mockRejectedValue(secret)
      mockIndexedUserProductFind.mockReturnValue(chain)
    },
    expected: { code: 'TAG_RULE_PREVIEW_FAILED', message: 'Erro interno do servidor' },
    body: { conditions: { source: 'USERPRODUCT', rules: [] } },
  },
  {
    name: 'list available tag-rule fields',
    route: requestHandler(getAvailableFields),
    arrange: () => { consoleLogSpy.mockImplementationOnce(() => { throw secret }) },
    expected: { code: 'TAG_RULE_FIELDS_READ_FAILED', message: 'Erro interno do servidor' },
  },
]

describe('SEC-10 ActiveCampaign and tag-controller wave', () => {
  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('contains the exact 32-site migration membership', () => {
    expect(operations).toHaveLength(32)
    expect(new Set(operations.map(({ expected }) => expected.code)).size).toBe(32)
  })

  it.each(operations)('$name returns its stable redacted central envelope', async ({
    route,
    arrange,
    expected,
    body,
    path,
  }) => {
    arrange()
    const response = await request(appForCentralError(route))
      .post((path ?? '/target') + offline)
      .send(body ?? {})

    expectCentralError(response, expected)
  })
})
