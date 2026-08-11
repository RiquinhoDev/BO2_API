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
const mockDirectCourseFindById: AsyncBoundaryMock = jest.fn()
const mockTagRuleFind: ChainBoundaryMock = jest.fn()
const mockTagRuleFindById: HybridBoundaryMock = jest.fn()
const mockTagRuleFindByIdAndUpdate: AsyncBoundaryMock = jest.fn()
const mockIndexedUserProductFind: ChainBoundaryMock = jest.fn()
const mockIndexedUserProductCountDocuments: AsyncBoundaryMock = jest.fn()
const mockUserFindOne: HybridBoundaryMock = jest.fn()
const mockUserFindById: AsyncBoundaryMock = jest.fn()
const mockUserFind: ChainBoundaryMock = jest.fn()
const mockUserCountDocuments: AsyncBoundaryMock = jest.fn()
const mockProductFind: ChainBoundaryMock = jest.fn()
const mockProductFindOne: AsyncBoundaryMock = jest.fn()
const mockProductFindById: HybridBoundaryMock = jest.fn()
const mockProductFindByIdAndUpdate: ChainBoundaryMock = jest.fn()
const mockProductCreate: AsyncBoundaryMock = jest.fn()
const mockDirectUserProductFind: ChainBoundaryMock = jest.fn()
const mockUserProductFindOne: AsyncBoundaryMock = jest.fn()
const mockDirectUserProductCountDocuments: AsyncBoundaryMock = jest.fn()
const mockDirectUserProductAggregate: AsyncBoundaryMock = jest.fn()
const mockProductProfileFind: ChainBoundaryMock = jest.fn()
const mockProductProfileFindOne: AsyncBoundaryMock = jest.fn()
const mockProductProfileCreate: AsyncBoundaryMock = jest.fn()
const mockProductProfileFindOneAndUpdate: AsyncBoundaryMock = jest.fn()
const mockProductProfileFindOneAndDelete: AsyncBoundaryMock = jest.fn()
const mockStudentEngagementStateCountDocuments: AsyncBoundaryMock = jest.fn()
const mockStudentEngagementStateAggregate: AsyncBoundaryMock = jest.fn()
const mockProductSalesStatsFind: ChainBoundaryMock = jest.fn()
const mockProductSalesStatsFindOne: ChainBoundaryMock = jest.fn()
const mockGetAllProductsStats: AsyncBoundaryMock = jest.fn()
const mockGetProductStats: AsyncBoundaryMock = jest.fn()
const mockGetEngagementStatsByPlatform: AsyncBoundaryMock = jest.fn()
const mockBuildProductSalesStats: AsyncBoundaryMock = jest.fn()
const mockGetProductSalesStats: AsyncBoundaryMock = jest.fn()
const mockListHotmartProducts: AsyncBoundaryMock = jest.fn()
const mockFindHotmartProductBySubdomain: AsyncBoundaryMock = jest.fn()
const mockListHotmartProductUsers: AsyncBoundaryMock = jest.fn()
const mockGetHotmartStatsSnapshot: AsyncBoundaryMock = jest.fn()
const mockSyncHistoryFind: ChainBoundaryMock = jest.fn()
const mockSyncHistoryCreate: AsyncBoundaryMock = jest.fn()
const mockSyncHistoryFindByIdAndUpdate: AsyncBoundaryMock = jest.fn()
const mockSyncReportFind: ChainBoundaryMock = jest.fn()
const mockFetchHotmartDataForSync: AsyncBoundaryMock = jest.fn()
const mockFetchProgressForExistingUsers: AsyncBoundaryMock = jest.fn()
const mockExecuteUniversalSync: AsyncBoundaryMock = jest.fn()
const mockGuruSnapshotFind: ChainBoundaryMock = jest.fn()
const mockGuruSnapshotFindOne: AsyncBoundaryMock = jest.fn()
const mockGuruSnapshotFindOneAndDelete: AsyncBoundaryMock = jest.fn()
const mockGuruSnapshotDeleteMany: AsyncBoundaryMock = jest.fn()
const mockGuruSnapshotCreate: AsyncBoundaryMock = jest.fn()
const mockFetchSubscriptionsByMonth: AsyncBoundaryMock = jest.fn()
const mockFetchAllSubscriptionsComplete: AsyncBoundaryMock = jest.fn()
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
  Class: {},
  Product: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
  SyncHistory: {
    find: mockSyncHistoryFind,
    create: mockSyncHistoryCreate,
    findByIdAndUpdate: mockSyncHistoryFindByIdAndUpdate,
  },
  User: {
    findOne: mockUserFindOne,
    find: mockUserFind,
  },
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
    find: mockUserFind,
    countDocuments: mockUserCountDocuments,
  },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: {
    findOne: mockProductFindOne,
    findById: mockProductFindById,
    find: mockProductFind,
    findByIdAndUpdate: mockProductFindByIdAndUpdate,
    create: mockProductCreate,
  },
}))

jest.mock('../../src/models/Course', () => ({
  __esModule: true,
  default: { findById: mockDirectCourseFindById },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: mockUserProductFindOne,
    find: mockDirectUserProductFind,
    countDocuments: mockDirectUserProductCountDocuments,
    aggregate: mockDirectUserProductAggregate,
  },
}))

jest.mock('../../src/models/product/ProductProfile', () => ({
  __esModule: true,
  default: {
    find: mockProductProfileFind,
    findOne: mockProductProfileFindOne,
    create: mockProductProfileCreate,
    findOneAndUpdate: mockProductProfileFindOneAndUpdate,
    findOneAndDelete: mockProductProfileFindOneAndDelete,
  },
}))

jest.mock('../../src/models/StudentEngagementState', () => ({
  __esModule: true,
  default: {
    countDocuments: mockStudentEngagementStateCountDocuments,
    aggregate: mockStudentEngagementStateAggregate,
  },
}))

jest.mock('../../src/models/product/ProductSalesStats', () => ({
  __esModule: true,
  default: {
    find: mockProductSalesStatsFind,
    findOne: mockProductSalesStatsFindOne,
  },
}))

jest.mock('../../src/models/GuruMonthlySnapshot', () => ({
  __esModule: true,
  default: {
    find: mockGuruSnapshotFind,
    findOne: mockGuruSnapshotFindOne,
    findOneAndDelete: mockGuruSnapshotFindOneAndDelete,
    deleteMany: mockGuruSnapshotDeleteMany,
    create: mockGuruSnapshotCreate,
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

jest.mock('../../src/models/SyncModels/SyncReport', () => ({
  __esModule: true,
  default: { find: mockSyncReportFind },
}))

jest.mock('../../src/services/userProducts/productService', () => ({
  KNOWN_PRODUCTS: { PRODUCT_ONE: { id: 'product-1' } },
  getAllProductsStats: mockGetAllProductsStats,
  getProductStats: mockGetProductStats,
}))

jest.mock('../../src/services/syncUtilizadoresServices/engagement/engagementService', () => ({
  getEngagementStatsByPlatform: mockGetEngagementStatsByPlatform,
}))

jest.mock('../../src/services/productSalesStatsBuilder', () => ({
  buildProductSalesStats: mockBuildProductSalesStats,
  getProductSalesStats: mockGetProductSalesStats,
}))

jest.mock('../../src/services/hotmart/hotmartCatalog.service', () => ({
  listHotmartProducts: mockListHotmartProducts,
  findHotmartProductBySubdomain: mockFindHotmartProductBySubdomain,
  listHotmartProductUsers: mockListHotmartProductUsers,
  getHotmartStatsSnapshot: mockGetHotmartStatsSnapshot,
}))

jest.mock('../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter', () => ({
  __esModule: true,
  default: {
    fetchHotmartDataForSync: mockFetchHotmartDataForSync,
    fetchProgressForExistingUsers: mockFetchProgressForExistingUsers,
  },
}))

jest.mock('../../src/services/syncUtilizadoresServices/universalSync', () => ({
  __esModule: true,
  default: { executeUniversalSync: mockExecuteUniversalSync },
}))

jest.mock('../../src/services/guru/guruSync.service', () => ({
  fetchSubscriptionsByMonth: mockFetchSubscriptionsByMonth,
  fetchAllSubscriptionsComplete: mockFetchAllSubscriptionsComplete,
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

const mockLoggerError = jest.fn()

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), error: mockLoggerError, warn: jest.fn() },
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
import { IntegrationUnavailableError } from '../../src/errors/integrationUnavailableError'
import {
  createProduct,
  deleteProduct,
  getAllProducts as getAllProductsV2,
  getProductAnalytics,
  getProductById as getProductByIdV2,
  getProductStudents,
  updateProduct,
} from '../../src/controllers/products/product.controller'
import {
  createProductProfile,
  deleteProductProfile,
  duplicateProductProfile,
  getAllProductProfiles,
  getProductProfileByCode,
  getProductProfileStats,
  updateProductProfile,
} from '../../src/controllers/products/productProfile.controller'
import {
  getEngagementStats,
  getProductById as getLegacyProductById,
  getProductUsers,
  getProducts as getLegacyProducts,
} from '../../src/controllers/products/products.controller'
import {
  compareProducts,
  getAllProductSalesStats,
  getProductSalesByPeriod,
  getProductSalesStatsByProduct,
  rebuildProductSalesStatsEndpoint,
} from '../../src/controllers/products/productSalesStats.controller'
import {
  getHotmartProductBySubdomain,
  getHotmartProducts,
  getHotmartProductUsers,
  getHotmartStats,
} from '../../src/controllers/hotmart/hotmartCatalog.controller'
import { compareSyncMethods, findHotmartUser } from '../../src/controllers/hotmart/hotmartDiagnostics.controller'
import { syncHotmartUsers } from '../../src/controllers/hotmart/hotmartLegacySync.controller'
import {
  syncHotmartUsersUniversal,
  syncProgressOnlyUniversal,
} from '../../src/controllers/hotmart/hotmartUniversalSync.controller'
import { getChurnFromSnapshots } from '../../src/controllers/guruSnapshots/analytics.controller'
import {
  createSnapshot,
  deleteAllSnapshots,
  deleteSnapshot,
  getSnapshot,
  listSnapshots,
  updateSnapshot,
} from '../../src/controllers/guruSnapshots/crud.controller'
import { createHistoricalSnapshots } from '../../src/controllers/guruSnapshots/history.controller'
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
    const centralLogger = jest.fn()
    const response = await request(appForCentralError(route, 'sec10-request', centralLogger))
      .post((path ?? '/target') + offline)
      .send(body ?? {})

    expectCentralError(response, expected)
    expect(console.error).not.toHaveBeenCalled()
    expect(mockLoggerError).not.toHaveBeenCalled()
    expect(centralLogger).toHaveBeenCalledTimes(1)
    expect(centralLogger).toHaveBeenCalledWith(expect.objectContaining({ correlationId: 'sec10-request' }))
    expect(JSON.stringify(centralLogger.mock.calls)).not.toMatch(/alice@example\.test|token=hidden/)
  })

  it('keeps audit compensation but logs only safe metadata when the audit write fails', async () => {
    const operation = operations.find(({ expected }) => expected.code === 'AC_MANUAL_EVALUATION_FAILED')
    if (operation === undefined) {
      throw new Error('ActiveCampaign manual evaluation fixture is missing')
    }
    operation.arrange()
    mockCronExecutionLogCreate.mockRejectedValueOnce(secret)
    const centralLogger = jest.fn()

    const response = await request(appForCentralError(operation.route, 'sec10-request', centralLogger))
      .post('/target' + offline)
      .send({})

    expectCentralError(response, operation.expected)
    expect(mockCronExecutionLogCreate).toHaveBeenCalledTimes(2)
    expect(mockCronExecutionLogCreate).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed' }))
    expect(mockLoggerError).toHaveBeenCalledTimes(1)
    expect(mockLoggerError).toHaveBeenCalledWith(
      'Falha ao registar auditoria da avaliação manual',
      expect.objectContaining({ executionId: expect.any(String), status: 'failed' }),
    )
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toMatch(/alice@example\.test|token=hidden/)
    expect(centralLogger).toHaveBeenCalledTimes(1)
  })
})
type Sec10BoundaryOperation = {
  family: 'products' | 'hotmart' | 'guru'
  name: string
  route: CentralErrorRoute
  arrange: (failure: unknown) => void
  expected: ExpectedCentralError
  body?: object
  requestPath?: string
}

const parameterizedHandler = <Params extends Record<string, string>>(
  handler: AsyncRouteHandler<Params>,
  path: string,
): CentralErrorRoute => {
  const router = Router()
  router.post(path, asyncRoute(handler))
  return { kind: 'router', mountPath: '/', router }
}

const productOperations: Sec10BoundaryOperation[] = [
  {
    family: 'products',
    name: 'list products',
    route: requestHandler(getAllProductsV2),
    arrange: (failure) => {
      mockProductFind.mockReturnValue({
        populate: jest.fn().mockReturnValue({ sort: jest.fn().mockRejectedValue(failure) }),
      })
    },
    expected: { code: 'PRODUCT_LIST_FAILED', message: 'Erro ao buscar produtos' },
  },
  {
    family: 'products',
    name: 'read product',
    route: parameterizedHandler(getProductByIdV2, '/target/:id'),
    arrange: (failure) => {
      mockProductFindById.mockReturnValue({ populate: jest.fn().mockRejectedValue(failure) })
    },
    expected: { code: 'PRODUCT_READ_FAILED', message: 'Erro ao buscar produto' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'create product',
    route: requestHandler(createProduct),
    arrange: (failure) => { mockDirectCourseFindById.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_CREATE_FAILED', message: 'Erro ao criar produto' },
    body: { code: 'P1', name: 'Product One', platform: 'hotmart', courseId: 'course-1' },
  },
  {
    family: 'products',
    name: 'update product',
    route: parameterizedHandler(updateProduct, '/target/:id'),
    arrange: (failure) => {
      mockProductFindByIdAndUpdate.mockReturnValue({ populate: jest.fn().mockRejectedValue(failure) })
    },
    expected: { code: 'PRODUCT_UPDATE_FAILED', message: 'Erro ao atualizar produto' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'delete product',
    route: parameterizedHandler(deleteProduct, '/target/:id'),
    arrange: (failure) => { mockDirectUserProductCountDocuments.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_DELETE_FAILED', message: 'Erro ao remover produto' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'list product students',
    route: parameterizedHandler(getProductStudents, '/target/:id'),
    arrange: (failure) => {
      const chain = {
        populate: jest.fn(), sort: jest.fn(), skip: jest.fn(), limit: jest.fn(),
      }
      chain.populate.mockReturnValue(chain)
      chain.sort.mockReturnValue(chain)
      chain.skip.mockReturnValue(chain)
      chain.limit.mockRejectedValue(failure)
      mockDirectUserProductFind.mockReturnValue(chain)
      mockDirectUserProductCountDocuments.mockResolvedValue(0)
    },
    expected: { code: 'PRODUCT_STUDENTS_READ_FAILED', message: 'Erro ao buscar estudantes' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'read product analytics',
    route: parameterizedHandler(getProductAnalytics, '/target/:id'),
    arrange: (failure) => { mockProductFindById.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_ANALYTICS_READ_FAILED', message: 'Erro ao buscar analytics' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'list legacy products',
    route: requestHandler(getLegacyProducts),
    arrange: (failure) => { mockGetAllProductsStats.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_LEGACY_LIST_FAILED', message: 'Erro ao buscar produtos' },
  },
  {
    family: 'products',
    name: 'list product users',
    route: requestHandler(getProductUsers),
    arrange: (failure) => {
      mockUserFind.mockReturnValue({
        select: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) }),
        }),
      })
    },
    expected: { code: 'PRODUCT_USERS_READ_FAILED', message: 'Erro ao buscar utilizadores' },
  },
  {
    family: 'products',
    name: 'read legacy product',
    route: parameterizedHandler(getLegacyProductById, '/target/:productId'),
    arrange: (failure) => { mockGetProductStats.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_LEGACY_READ_FAILED', message: 'Erro ao buscar produto' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'read product engagement stats',
    route: requestHandler(getEngagementStats),
    arrange: (failure) => { mockGetEngagementStatsByPlatform.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_ENGAGEMENT_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas de engagement' },
  },
  {
    family: 'products',
    name: 'list product sales stats',
    route: requestHandler(getAllProductSalesStats),
    arrange: (failure) => { mockGetProductSalesStats.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_SALES_STATS_LIST_FAILED', message: 'Erro ao buscar estatísticas' },
  },
  {
    family: 'products',
    name: 'read product sales stats',
    route: parameterizedHandler(getProductSalesStatsByProduct, '/target/:productId'),
    arrange: (failure) => {
      mockProductSalesStatsFindOne.mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) })
    },
    expected: { code: 'PRODUCT_SALES_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas' },
    requestPath: '/target/product-1',
  },
  {
    family: 'products',
    name: 'read product sales period',
    route: requestHandler(getProductSalesByPeriod),
    arrange: (failure) => {
      mockProductSalesStatsFind.mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) })
    },
    expected: { code: 'PRODUCT_SALES_PERIOD_READ_FAILED', message: 'Erro ao buscar estatísticas' },
    requestPath: '/target?startDate=2026-01-01&endDate=2026-01-31',
  },
  {
    family: 'products',
    name: 'start product sales rebuild',
    route: requestHandler(rebuildProductSalesStatsEndpoint),
    arrange: (failure) => { consoleLogSpy.mockImplementationOnce(() => { throw failure }) },
    expected: { code: 'PRODUCT_SALES_REBUILD_FAILED', message: 'Erro ao iniciar rebuild' },
  },
  {
    family: 'products',
    name: 'compare product sales',
    route: requestHandler(compareProducts),
    arrange: (failure) => {
      mockProductSalesStatsFind.mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) })
    },
    expected: { code: 'PRODUCT_SALES_COMPARE_FAILED', message: 'Erro ao comparar produtos' },
    body: { productIds: ['product-1'] },
  },
  {
    family: 'products',
    name: 'list product profiles',
    route: requestHandler(getAllProductProfiles),
    arrange: (failure) => {
      mockProductProfileFind.mockReturnValue({ sort: jest.fn().mockRejectedValue(failure) })
    },
    expected: { code: 'PRODUCT_PROFILE_LIST_FAILED', message: 'Erro ao buscar perfis de produto' },
  },
  {
    family: 'products',
    name: 'read product profile',
    route: parameterizedHandler(getProductProfileByCode, '/target/:code'),
    arrange: (failure) => { mockProductProfileFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_PROFILE_READ_FAILED', message: 'Erro ao buscar perfil de produto' },
    requestPath: '/target/P1',
  },
  {
    family: 'products',
    name: 'create product profile',
    route: requestHandler(createProductProfile),
    arrange: (failure) => { mockProductProfileFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_PROFILE_CREATE_FAILED', message: 'Erro ao criar perfil de produto' },
    body: { name: 'Profile One', code: 'P1', reengagementLevels: [{ level: 1 }] },
  },
  {
    family: 'products',
    name: 'update product profile',
    route: parameterizedHandler(updateProductProfile, '/target/:code'),
    arrange: (failure) => { mockProductProfileFindOneAndUpdate.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_PROFILE_UPDATE_FAILED', message: 'Erro ao atualizar perfil de produto' },
    requestPath: '/target/P1',
  },
  {
    family: 'products',
    name: 'delete product profile',
    route: requestHandler((_req, res, next) => Reflect.apply(deleteProductProfile, undefined, [
      { params: { code: 'P1' }, query: { hardDelete: 'false' }, body: {} }, res, next,
    ])),
    arrange: (failure) => { mockProductProfileFindOneAndUpdate.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_PROFILE_DELETE_FAILED', message: 'Erro ao deletar perfil de produto' },
  },
  {
    family: 'products',
    name: 'read product profile stats',
    route: parameterizedHandler(getProductProfileStats, '/target/:code'),
    arrange: (failure) => { mockProductProfileFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_PROFILE_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas' },
    requestPath: '/target/P1',
  },
  {
    family: 'products',
    name: 'duplicate product profile',
    route: parameterizedHandler(duplicateProductProfile, '/target/:code'),
    arrange: (failure) => { mockProductProfileFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'PRODUCT_PROFILE_DUPLICATE_FAILED', message: 'Erro ao duplicar perfil de produto' },
    requestPath: '/target/P1',
    body: { newCode: 'P2', newName: 'Profile Two' },
  },
]

const hotmartOperations: Sec10BoundaryOperation[] = [
  {
    family: 'hotmart', name: 'list Hotmart products', route: requestHandler(getHotmartProducts),
    arrange: (failure) => { mockListHotmartProducts.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_PRODUCT_LIST_FAILED', message: 'Erro ao buscar produtos Hotmart' },
  },
  {
    family: 'hotmart', name: 'read Hotmart product',
    route: parameterizedHandler(getHotmartProductBySubdomain, '/target/:subdomain'),
    arrange: (failure) => { mockFindHotmartProductBySubdomain.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_PRODUCT_READ_FAILED', message: 'Erro ao buscar produto Hotmart' },
    requestPath: '/target/product-one',
  },
  {
    family: 'hotmart', name: 'list Hotmart product users',
    route: parameterizedHandler(getHotmartProductUsers, '/target/:subdomain'),
    arrange: (failure) => { mockListHotmartProductUsers.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_PRODUCT_USERS_READ_FAILED', message: 'Erro ao buscar utilizadores Hotmart' },
    requestPath: '/target/product-one',
  },
  {
    family: 'hotmart', name: 'read Hotmart stats', route: requestHandler(getHotmartStats),
    arrange: (failure) => { mockGetHotmartStatsSnapshot.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas Hotmart' },
  },
  {
    family: 'hotmart', name: 'find Hotmart user', route: requestHandler(findHotmartUser),
    arrange: (failure) => { mockUserFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_USER_READ_FAILED', message: 'Erro ao buscar utilizador' },
    requestPath: '/target?email=alice@example.test',
  },
  {
    family: 'hotmart', name: 'compare Hotmart sync methods', route: requestHandler(compareSyncMethods),
    arrange: (failure) => {
      const chain = {
        sort: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn(),
      }
      chain.sort.mockReturnValue(chain)
      chain.limit.mockReturnValue(chain)
      chain.select.mockReturnValue(chain)
      chain.lean.mockRejectedValue(failure)
      mockSyncHistoryFind.mockReturnValue(chain)
    },
    expected: { code: 'HOTMART_SYNC_COMPARISON_FAILED', message: 'Erro ao comparar sincronizações Hotmart' },
  },
  {
    family: 'hotmart', name: 'run legacy Hotmart sync', route: requestHandler(syncHotmartUsers),
    arrange: (failure) => { mockSyncHistoryCreate.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_LEGACY_SYNC_FAILED', message: 'Erro crítico na sincronização com Hotmart' },
  },
  {
    family: 'hotmart', name: 'run universal Hotmart sync', route: requestHandler(syncHotmartUsersUniversal),
    arrange: (failure) => { mockFetchHotmartDataForSync.mockRejectedValueOnce(failure) },
    expected: { code: 'HOTMART_UNIVERSAL_SYNC_FAILED', message: 'Erro ao executar sincronização via Universal Service' },
  },
  {
    family: 'hotmart', name: 'run universal Hotmart progress sync', route: requestHandler(syncProgressOnlyUniversal),
    arrange: (failure) => {
      mockUserFind.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) }) })
    },
    expected: { code: 'HOTMART_PROGRESS_SYNC_FAILED', message: 'Erro ao sincronizar progresso Hotmart' },
  },
]

const guruOperations: Sec10BoundaryOperation[] = [
  {
    family: 'guru', name: 'read snapshot churn', route: requestHandler(getChurnFromSnapshots),
    arrange: (failure) => {
      mockGuruSnapshotFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) }),
      })
    },
    expected: { code: 'GURU_SNAPSHOT_CHURN_READ_FAILED', message: 'Erro ao calcular churn dos snapshots' },
  },
  {
    family: 'guru', name: 'create snapshot', route: requestHandler(createSnapshot),
    arrange: (failure) => { mockGuruSnapshotFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'GURU_SNAPSHOT_CREATE_FAILED', message: 'Erro ao criar snapshot' },
    body: { year: 2026, month: 1, source: 'guru_api' },
  },
  {
    family: 'guru', name: 'update snapshot',
    route: parameterizedHandler(updateSnapshot, '/target/:year/:month'),
    arrange: (failure) => { mockFetchAllSubscriptionsComplete.mockRejectedValueOnce(failure) },
    expected: { code: 'GURU_SNAPSHOT_UPDATE_FAILED', message: 'Erro ao atualizar snapshot' },
    requestPath: '/target/2026/1',
  },
  {
    family: 'guru', name: 'list snapshots', route: requestHandler(listSnapshots),
    arrange: (failure) => {
      mockGuruSnapshotFind.mockReturnValue({
        sort: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(failure) }),
      })
    },
    expected: { code: 'GURU_SNAPSHOT_LIST_FAILED', message: 'Erro ao listar snapshots' },
  },
  {
    family: 'guru', name: 'read snapshot',
    route: parameterizedHandler(getSnapshot, '/target/:year/:month'),
    arrange: (failure) => { mockGuruSnapshotFindOne.mockRejectedValueOnce(failure) },
    expected: { code: 'GURU_SNAPSHOT_READ_FAILED', message: 'Erro ao obter snapshot' },
    requestPath: '/target/2026/1',
  },
  {
    family: 'guru', name: 'delete snapshot',
    route: requestHandler((_req, res, next) => Reflect.apply(deleteSnapshot, undefined, [
      { params: { year: '2026', month: '1' }, query: {}, body: {} }, res, next,
    ])),
    arrange: (failure) => { mockGuruSnapshotFindOneAndDelete.mockRejectedValueOnce(failure) },
    expected: { code: 'GURU_SNAPSHOT_DELETE_FAILED', message: 'Erro ao apagar snapshot' },
  },
  {
    family: 'guru', name: 'delete all snapshots',
    route: requestHandler((_req, res, next) => Reflect.apply(deleteAllSnapshots, undefined, [
      { params: {}, query: {}, body: {} }, res, next,
    ])),
    arrange: (failure) => { mockGuruSnapshotDeleteMany.mockRejectedValueOnce(failure) },
    expected: { code: 'GURU_SNAPSHOT_DELETE_ALL_FAILED', message: 'Erro ao apagar snapshots' },
  },
  {
    family: 'guru', name: 'create historical snapshots', route: requestHandler(createHistoricalSnapshots),
    arrange: (failure) => { mockFetchAllSubscriptionsComplete.mockRejectedValueOnce(failure) },
    expected: { code: 'GURU_SNAPSHOT_HISTORICAL_CREATE_FAILED', message: 'Erro ao criar snapshots históricos' },
  },
]

const sec10Operations = [...productOperations, ...hotmartOperations, ...guruOperations]

function offlinePath(path: string): string {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}__bo2_offline_loopback=1`
}

async function requestBoundary(operation: Sec10BoundaryOperation): Promise<request.Response> {
  operation.arrange(secret)
  return request(appForCentralError(operation.route))
    .post(offlinePath(operation.requestPath ?? '/target'))
    .send(operation.body ?? {})
}

describe('SEC-10 products, Hotmart and Guru snapshot wave', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('contains the exact 40-site migration membership', () => {
    expect(sec10Operations).toHaveLength(40)
    expect(productOperations).toHaveLength(23)
    expect(hotmartOperations).toHaveLength(9)
    expect(guruOperations).toHaveLength(8)
    expect(new Set(sec10Operations.map(({ expected }) => expected.code)).size).toBe(40)
  })

  it.each(sec10Operations)('$name returns its stable redacted central envelope', async (operation) => {
    const response = await requestBoundary(operation)
    expectCentralError(response, operation.expected)
  })

  it.each([
    { family: 'products', operation: productOperations[0], failure: 'product rejection' },
    { family: 'hotmart', operation: hotmartOperations[0], failure: 'hotmart rejection' },
    { family: 'guru', operation: guruOperations[0], failure: 'guru rejection' },
  ])('normalizes a non-Error $family rejection', async ({ operation, failure }) => {
    operation.arrange(failure)
    const response = await request(appForCentralError(operation.route))
      .post(offlinePath(operation.requestPath ?? '/target'))
      .send(operation.body ?? {})

    expectCentralError(response, operation.expected)
  })

  it.each([
    {
      family: 'Hotmart',
      route: requestHandler(getHotmartProducts),
      arrange: () => { mockListHotmartProducts.mockRejectedValueOnce(new IntegrationUnavailableError('hotmart')) },
      body: {},
    },
    {
      family: 'Guru',
      route: requestHandler(createSnapshot),
      arrange: () => {
        mockGuruSnapshotFindOne.mockResolvedValueOnce(null)
        mockFetchSubscriptionsByMonth.mockRejectedValueOnce(new IntegrationUnavailableError('guru'))
      },
      body: { year: 2026, month: 1, source: 'guru_api' },
    },
  ])('preserves $family runtime-unavailable classification', async ({ route, arrange, body }) => {
    arrange()
    const response = await request(appForCentralError(route)).post('/target' + offline).send(body)

    expect(response.status).toBe(503)
    expect(response.body).toEqual({
      success: false,
      code: 'INTEGRATION_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível',
      correlationId: 'sec10-request',
    })
  })
})
