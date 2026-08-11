import request from 'supertest'
import { StudentDataFetchError } from '../../src/types/studentComplete'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { appForCentralError, expectCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

const mockCompleteStudent = jest.fn()
jest.mock('../../src/services/studentCompleteService', () => ({
  __esModule: true,
  default: { getCompleteStudentData: mockCompleteStudent },
}))

const mockUserFindById = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserFind = jest.fn()
const mockUserFindByIdAndUpdate = jest.fn()
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findById: mockUserFindById,
    findOne: mockUserFindOne,
    find: mockUserFind,
    findByIdAndUpdate: mockUserFindByIdAndUpdate,
  },
}))

const mockHistoryFind = jest.fn()
const mockHistoryCount = jest.fn()
const mockHistoryCreate = jest.fn()
jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: { find: mockHistoryFind, countDocuments: mockHistoryCount },
  ensureUserHistoryModel: () => ({
    find: mockHistoryFind,
    countDocuments: mockHistoryCount,
    create: mockHistoryCreate,
    aggregate: jest.fn(),
  }),
}))

jest.mock('../../src/models/UserProduct', () => ({ __esModule: true, default: { find: jest.fn(), updateMany: jest.fn() } }))
jest.mock('../../src/models', () => ({ UserProduct: { find: jest.fn() } }))
jest.mock('../../src/models/product/Product', () => ({ __esModule: true, default: { findById: jest.fn() } }))
jest.mock('../../src/services/snapshotServices/userSnapshot.service', () => ({ snapshotAndCompare: jest.fn() }))
jest.mock('../../src/jobs/dailyPipeline/tagEvaluation/evaluateStudentTags', () => ({ evaluateStudentTags: jest.fn() }))
jest.mock('../../src/jobs/dailyPipeline/tagEvaluation/globalUserTags', () => ({ evaluateGlobalUserTags: jest.fn() }))

import studentsRouter from '../../src/routes/students'
import tagEvaluationRouter from '../../src/routes/tagEvaluation.routes'
import testHistoryRouter from '../../src/routes/testHistory.routes'
import userHistoryRouter from '../../src/routes/userHistory.routes'

const objectId = '507f1f77bcf86cd799439011'
const secret = new Error('secret alice@example.test token=hidden')

const operations = [
  { name: 'student complete typed fetch', router: studentsRouter, path: `/${objectId}/complete`, arrange: () => mockCompleteStudent.mockRejectedValueOnce(new StudentDataFetchError('Falha ao buscar dados', secret)), code: 'STUDENT_COMPLETE_DATA_FETCH_FAILED', message: 'Falha ao buscar dados' },
  { name: 'student complete generic', router: studentsRouter, path: `/${objectId}/complete`, arrange: () => mockCompleteStudent.mockRejectedValueOnce(secret), code: 'STUDENT_COMPLETE_READ_FAILED', message: 'Erro interno ao buscar dados do estudante' },
  { name: 'student history', router: studentsRouter, path: `/${objectId}/history`, arrange: () => mockUserFindById.mockImplementationOnce(() => { throw secret }), code: 'STUDENT_HISTORY_READ_FAILED', message: 'Erro ao buscar histórico do estudante' },
  { name: 'student history summary', router: studentsRouter, path: `/${objectId}/history/summary`, arrange: () => mockUserFindById.mockImplementationOnce(() => { throw secret }), code: 'STUDENT_HISTORY_SUMMARY_READ_FAILED', message: 'Erro ao buscar resumo do histórico' },
  { name: 'tag evaluation', router: tagEvaluationRouter, path: '/evaluate', body: { email: 'alice@example.test' }, arrange: () => mockUserFindOne.mockImplementationOnce(() => { throw secret }), code: 'TAG_EVALUATION_FAILED', message: 'Erro ao avaliar tags' },
  { name: 'tag batch', router: tagEvaluationRouter, path: '/evaluate-batch', body: { emails: ['alice@example.test'] }, arrange: () => mockUserFind.mockImplementationOnce(() => { throw secret }), code: 'TAG_EVALUATION_BATCH_FAILED', message: 'Erro ao avaliar tags em batch' },
  { name: 'test changes', router: testHistoryRouter, path: '/make-changes', body: { email: 'alice@example.test' }, arrange: () => mockUserFindOne.mockImplementationOnce(() => { throw secret }), code: 'TEST_HISTORY_CHANGES_FAILED', message: 'Erro ao fazer alterações de teste' },
  { name: 'test revert', router: testHistoryRouter, path: '/revert-changes', body: { originalState: { userId: objectId, products: [] } }, arrange: () => mockUserFindByIdAndUpdate.mockRejectedValueOnce(secret), code: 'TEST_HISTORY_REVERT_FAILED', message: 'Erro ao reverter alterações' },
  { name: 'user history', router: userHistoryRouter, path: `/user?userId=${objectId}`, arrange: () => mockHistoryFind.mockImplementationOnce(() => { throw secret }), code: 'USER_HISTORY_READ_FAILED', message: 'Erro ao buscar histórico do usuário' },
  { name: 'all history', router: userHistoryRouter, path: '/all', arrange: () => mockHistoryFind.mockImplementationOnce(() => { throw secret }), code: 'USER_HISTORY_LIST_FAILED', message: 'Erro ao buscar histórico geral' },
  { name: 'manual history', router: userHistoryRouter, path: '/manual', body: { userId: objectId, userEmail: 'alice@example.test', changeType: 'MANUAL' }, arrange: () => mockHistoryCreate.mockRejectedValueOnce(secret), code: 'USER_HISTORY_CREATE_FAILED', message: 'Erro ao criar entrada de histórico' },
]

describe('SEC-10 histories and tag evaluation boundary', () => {
  beforeEach(() => { jest.resetAllMocks(); jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined) })
  afterEach(() => { jest.restoreAllMocks() })

  it('covers the exact 11-site membership', () => { expect(operations).toHaveLength(11) })
  it.each(operations)('$name uses the central envelope', async (operation) => {
    operation.arrange()
    const pending = request(appForCentralError({ kind: 'router', router: operation.router, mountPath: '/' }))[operation.body ? 'post' : 'get'](`${operation.path}${operation.path.includes('?') ? '&' : '?'}__bo2_offline_loopback=1`)
    const response = operation.body === undefined ? await pending : await pending.send(operation.body)
    expectCentralError(response, { code: operation.code, message: operation.message })
  })

  it('keeps a per-user tag failure partial and redacts its cause', async () => {
    mockUserFind.mockReturnValueOnce({
      limit: () => ({
        lean: async () => [{ _id: objectId, email: 'alice@example.test' }],
      }),
    })
    mockUserFindOne.mockImplementationOnce(() => { throw secret })

    const response = await request(appForCentralError({ kind: 'router', router: tagEvaluationRouter, mountPath: '/' }))
      .post('/evaluate-batch?__bo2_offline_loopback=1')
      .send({ emails: ['alice@example.test'] })

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      success: true,
      summary: { totalUsers: 1, processed: 0, errors: 1 },
      errors: [{ email: 'alice@example.test', error: 'Erro ao avaliar tags' }],
    })
    expect(JSON.stringify(response.body)).not.toContain(secret.message)
  })
})
