import type { NextFunction, Request, Response } from 'express'
import { Router } from 'express'
import request from 'supertest'

jest.mock('../../src/models', () => ({
  ACContactState: { findOne: jest.fn(), deleteMany: jest.fn() },
  Course: { findOne: jest.fn(), findById: jest.fn() },
  Product: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
  TagRule: {
    find: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  },
  UserProduct: {
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}))

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), countDocuments: jest.fn() },
}))

jest.mock('../../src/models/product/Product', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), findById: jest.fn(), find: jest.fn() },
}))

jest.mock('../../src/models/UserProduct', () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    aggregate: jest.fn(),
  },
}))

jest.mock('../../src/models/acTags/CommunicationHistory', () => ({
  __esModule: true,
  default: { find: jest.fn(), countDocuments: jest.fn(), aggregate: jest.fn() },
}))

jest.mock('../../src/models/acTags/TagRule', () => {
  const model = Object.assign(jest.fn(), {
    find: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  })
  model.prototype.save = jest.fn()
  return { __esModule: true, default: model }
})

jest.mock('../../src/models/cron/CronExecutionLog', () => ({
  __esModule: true,
  default: { find: jest.fn(), create: jest.fn() },
}))

jest.mock('../../src/services/activeCampaign/contactTagReader.service', () => ({
  __esModule: true,
  default: { getContactTags: jest.fn() },
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
  ACContactState,
  Course,
  Product as IndexedProduct,
  TagRule as IndexedTagRule,
  UserProduct as IndexedUserProduct,
} from '../../src/models'
import User from '../../src/models/user'
import Product from '../../src/models/product/Product'
import UserProduct from '../../src/models/UserProduct'
import CommunicationHistory from '../../src/models/acTags/CommunicationHistory'
import LegacyTagRule from '../../src/models/acTags/TagRule'
import CronExecutionLog from '../../src/models/cron/CronExecutionLog'
import contactTagReaderService from '../../src/services/activeCampaign/contactTagReader.service'
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
type ValidatedController = (
  input: object,
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>
type WaveOperation = {
  name: string
  route: HandlerRoute
  arrange: () => void
  expected: ExpectedCentralError
  body?: object
}

const requestHandler = (handler: unknown): HandlerRoute => ({
  kind: 'handler',
  method: 'post',
  handler: handler as HandlerRoute['handler'],
})

const validatedHandler = (handler: unknown, input: object): HandlerRoute =>
  requestHandler((req: Request, res: Response, next: NextFunction) =>
    (handler as ValidatedController)(input, req, res, next),
  )

const rejectSelectedLean = (model: typeof User): void => {
  jest.spyOn(model, 'findOne').mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockRejectedValue(secret) }),
  } as never)
}

let consoleLogSpy: jest.SpiedFunction<typeof console.log>

const operations: WaveOperation[] = [
  {
    name: 'read contact tags',
    route: requestHandler(getContactTags),
    arrange: () => { jest.spyOn(ACContactState, 'findOne').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CONTACT_TAGS_READ_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'sync contact tags',
    route: requestHandler(syncContactTags),
    arrange: () => rejectSelectedLean(User),
    expected: { code: 'AC_CONTACT_TAGS_SYNC_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'batch read contact tags',
    route: requestHandler(getBatchContactTags),
    arrange: () => { jest.spyOn(contactTagReaderService, 'getContactTags').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CONTACT_TAGS_BATCH_READ_FAILED', message: 'Erro interno do servidor' },
    body: { emails: ['alice@example.test'] },
  },
  {
    name: 'batch sync contact tags',
    route: requestHandler(batchSyncContacts),
    arrange: () => rejectSelectedLean(User),
    expected: { code: 'AC_CONTACT_TAGS_BATCH_SYNC_FAILED', message: 'Erro interno do servidor' },
    body: { emails: ['alice@example.test'] },
  },
  {
    name: 'clear contact cache',
    route: requestHandler(clearACCache),
    arrange: () => { jest.spyOn(ACContactState, 'deleteMany').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CONTACT_CACHE_CLEAR_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'read Clareza students',
    route: requestHandler(getClarezaStudents),
    arrange: () => { jest.spyOn(Course, 'findOne').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CLAREZA_STUDENTS_READ_FAILED', message: 'Erro ao buscar alunos' },
  },
  {
    name: 'preview Clareza rules',
    route: requestHandler(evaluateClarezaRules),
    arrange: () => { jest.spyOn(Course, 'findOne').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_CLAREZA_RULES_PREVIEW_FAILED', message: 'Erro ao pré-visualizar regras' },
  },
  {
    name: 'read OGI students',
    route: requestHandler(getOGIStudents),
    arrange: () => { jest.spyOn(Course, 'findOne').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_OGI_STUDENTS_READ_FAILED', message: 'Erro ao buscar alunos' },
  },
  {
    name: 'preview OGI rules',
    route: requestHandler(evaluateOGIRules),
    arrange: () => { jest.spyOn(Course, 'findOne').mockRejectedValueOnce(secret) },
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
      jest.spyOn(CommunicationHistory, 'find').mockReturnValue(chain as never)
      jest.spyOn(CommunicationHistory, 'countDocuments').mockResolvedValue(0)
    },
    expected: { code: 'AC_HISTORY_LIST_FAILED', message: 'Erro ao buscar histórico' },
  },
  {
    name: 'read communication history stats',
    route: requestHandler(getHistoryStats),
    arrange: () => { jest.spyOn(CommunicationHistory, 'aggregate').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_HISTORY_STATS_FAILED', message: 'Erro ao calcular estatísticas' },
  },
  {
    name: 'list legacy tag rules',
    route: requestHandler(getAllTagRules),
    arrange: () => {
      jest.spyOn(LegacyTagRule, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ sort: jest.fn().mockRejectedValue(secret) }),
      } as never)
    },
    expected: { code: 'AC_LEGACY_TAG_RULE_LIST_FAILED', message: 'Erro ao buscar regras' },
  },
  {
    name: 'create legacy tag rule',
    route: requestHandler(createTagRule),
    arrange: () => { jest.spyOn(LegacyTagRule.prototype, 'save').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_LEGACY_TAG_RULE_CREATE_FAILED', message: 'Erro ao criar regra' },
  },
  {
    name: 'update legacy tag rule',
    route: requestHandler(updateTagRule),
    arrange: () => { jest.spyOn(LegacyTagRule, 'findByIdAndUpdate').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_LEGACY_TAG_RULE_UPDATE_FAILED', message: 'Erro ao atualizar regra' },
  },
  {
    name: 'delete legacy tag rule',
    route: validatedHandler(deleteTagRule, {
      params: { id: '507f1f77bcf86cd799439011' }, query: {}, body: {},
    }),
    arrange: () => { jest.spyOn(LegacyTagRule, 'findByIdAndDelete').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_LEGACY_TAG_RULE_DELETE_FAILED', message: 'Erro ao deletar regra' },
  },
  {
    name: 'run manual ActiveCampaign evaluation',
    route: validatedHandler(testCron, { params: {}, query: {}, body: {} }),
    arrange: () => {
      jest.spyOn(Product, 'find').mockReturnValue({
        populate: jest.fn().mockRejectedValue(secret),
      } as never)
      jest.spyOn(CronExecutionLog, 'create').mockResolvedValue({} as never)
    },
    expected: { code: 'AC_MANUAL_EVALUATION_FAILED', message: 'Erro na avaliação manual' },
  },
  {
    name: 'list ActiveCampaign cron logs',
    route: requestHandler(getCronLogs),
    arrange: () => {
      jest.spyOn(CronExecutionLog, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({ limit: jest.fn().mockRejectedValue(secret) }),
      } as never)
    },
    expected: { code: 'AC_CRON_LOGS_READ_FAILED', message: 'Erro ao buscar cron logs' },
  },
  {
    name: 'read ActiveCampaign stats',
    route: requestHandler(getStats),
    arrange: () => { jest.spyOn(User, 'countDocuments').mockRejectedValueOnce(secret) },
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
    arrange: () => { jest.spyOn(User, 'findById').mockRejectedValueOnce(secret) },
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
    arrange: () => { jest.spyOn(UserProduct, 'findOne').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAG_REMOVE_FAILED', message: 'Erro ao remover tag' },
  },
  {
    name: 'read product tagged users',
    route: requestHandler(getUsersWithTagsInProduct),
    arrange: () => { jest.spyOn(Product, 'findById').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAGGED_USERS_READ_FAILED', message: 'Erro ao buscar tags do produto' },
  },
  {
    name: 'read product tag stats',
    route: requestHandler(getACStats),
    arrange: () => {
      jest.spyOn(Product, 'find').mockReturnValue({ lean: jest.fn().mockRejectedValue(secret) } as never)
    },
    expected: { code: 'AC_PRODUCT_TAG_STATS_READ_FAILED', message: 'Erro ao buscar estatísticas AC' },
  },
  {
    name: 'sync product tags',
    route: validatedHandler(syncProductTags, {
      params: { productId: '507f191e810c19729de860ea' }, query: {}, body: {},
    }),
    arrange: () => { jest.spyOn(Product, 'findById').mockRejectedValueOnce(secret) },
    expected: { code: 'AC_PRODUCT_TAG_SYNC_FAILED', message: 'Erro ao sincronizar tags' },
  },
  {
    name: 'list tag rules',
    route: requestHandler(getAllRules),
    arrange: () => {
      jest.spyOn(IndexedTagRule, 'find').mockReturnValue({
        populate: jest.fn().mockReturnValue({ sort: jest.fn().mockRejectedValue(secret) }),
      } as never)
    },
    expected: { code: 'TAG_RULE_LIST_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'read tag rule',
    route: requestHandler(getRuleById),
    arrange: () => {
      jest.spyOn(IndexedTagRule, 'findById').mockReturnValue({
        populate: jest.fn().mockRejectedValue(secret),
      } as never)
    },
    expected: { code: 'TAG_RULE_READ_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'create tag rule',
    route: requestHandler(createRule),
    arrange: () => { jest.spyOn(Course, 'findById').mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_CREATE_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'update tag rule',
    route: requestHandler(updateRule),
    arrange: () => { jest.spyOn(IndexedTagRule, 'findByIdAndUpdate').mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_UPDATE_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'delete tag rule',
    route: requestHandler(deleteRule),
    arrange: () => { jest.spyOn(IndexedTagRule, 'findByIdAndUpdate').mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_DELETE_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'test tag rule dry-run',
    route: requestHandler(testRule),
    arrange: () => { jest.spyOn(IndexedTagRule, 'findById').mockRejectedValueOnce(secret) },
    expected: { code: 'TAG_RULE_TEST_FAILED', message: 'Erro interno do servidor' },
  },
  {
    name: 'estimate affected tag-rule users',
    route: requestHandler(estimateAffectedUsers),
    arrange: () => { jest.spyOn(IndexedUserProduct, 'countDocuments').mockRejectedValueOnce(secret) },
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
      jest.spyOn(IndexedUserProduct, 'find').mockReturnValue(chain as never)
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
  }) => {
    arrange()
    const response = await request(appForCentralError(route))
      .post('/target' + offline)
      .send(body ?? {})

    expectCentralError(response, expected)
  })
})
