import express, { type NextFunction, type Request, type Response } from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import { asyncRoute, type AsyncRouteHandler } from '../../src/security/asyncRoute'

const mockRenewalFind = jest.fn()
const mockRenewalFindOne = jest.fn()
const mockRenewalFindByIdAndUpdate = jest.fn()
const mockRenewalCreate = jest.fn()
const mockRenewalSync = jest.fn()
const mockRenewalCoverage = jest.fn()
const mockRenewalPerformance = jest.fn()
const mockTrialList = jest.fn()
const mockTrialStats = jest.fn()
const mockTrialExpired = jest.fn()
const mockTrialSync = jest.fn()
const mockTrialRevert = jest.fn()
const mockTrialInactivate = jest.fn()
const mockUserFindOne = jest.fn()
const mockUserAggregate = jest.fn()
const mockUserFind = jest.fn()
const mockAchievementSingle = jest.fn()
const mockAchievementAll = jest.fn()
const mockUserCount = jest.fn()
const mockProductCount = jest.fn()
const mockEnrollmentCount = jest.fn()
const mockProductAggregate = jest.fn()
const mockEnrollmentAggregate = jest.fn()
const mockLoggerInfo = jest.fn()

jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: mockLoggerInfo,
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}))

jest.mock('../../src/models/RenewalOffer', () => ({
  __esModule: true,
  default: {
    find: mockRenewalFind,
    findOne: mockRenewalFindOne,
    findByIdAndUpdate: mockRenewalFindByIdAndUpdate,
    create: mockRenewalCreate,
  },
}))

jest.mock('../../src/services/renewal/renewalSync.service', () => ({
  syncRenewalOffers: mockRenewalSync,
}))
jest.mock('../../src/services/renewal/renewalCoverage.service', () => ({
  getTurmasWithCoverage: mockRenewalCoverage,
}))
jest.mock('../../src/services/renewal/renewalPerformance.service', () => ({
  getRenewalPerformance: mockRenewalPerformance,
}))
jest.mock('../../src/services/guru/guruTrialService', () => ({
  listTrials: mockTrialList,
  getTrialStats: mockTrialStats,
  checkExpiredTrials: mockTrialExpired,
  syncTrialsFromGuru: mockTrialSync,
  revertTrial: mockTrialRevert,
  manuallyInactivateTrial: mockTrialInactivate,
}))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: {
    findOne: mockUserFindOne,
    aggregate: mockUserAggregate,
    find: mockUserFind,
  },
}))
jest.mock('../../src/services/achievements/achievementEvaluation.service', () => ({
  evaluateAndPersistAchievements: mockAchievementSingle,
  evaluateAllAchievements: mockAchievementAll,
}))
jest.mock('../../src/services/achievements/achievementDefinitions', () => ({
  ACHIEVEMENT_DEFINITIONS: [],
  TOTAL_ACHIEVEMENTS: 0,
}))
jest.mock('../../src/services/studentOgiSummary.service', () => ({
  isValidSummaryAccessToken: jest.fn(() => true),
  normalizeStudentEmail: jest.fn((email: string) => email.toLowerCase().trim()),
  resolveStudentEmailFromToken: jest.fn(() => 'student@example.test'),
}))
jest.mock('../../src/models', () => ({
  User: { countDocuments: mockUserCount, aggregate: mockUserAggregate },
  Product: { countDocuments: mockProductCount, aggregate: mockProductAggregate },
  UserProduct: { countDocuments: mockEnrollmentCount, aggregate: mockEnrollmentAggregate },
}))

import * as renewalController from '../../src/controllers/renewal.controller'
import * as trialController from '../../src/controllers/guru.trials.controller'
import * as webhookController from '../../src/controllers/webhooks.controller'
import { getSyncStatus } from '../../src/controllers/sync/status.controller'
import achievementsRouter from '../../src/routes/achievements.routes'
import { TrialNotEndedError, TrialUserNotFoundError } from '../../src/services/guru/guruTrialErrors'

const secret = new Error('secret alice@example.test token=hidden')
const correlationId = 'public-detail-request'
const offline = '?__bo2_offline_loopback=1'

function appFor(handler: AsyncRouteHandler, method: 'get' | 'post' | 'patch' = 'get') {
  const app = express()
  const errors = createErrorHandling({ generateCorrelationId: () => correlationId, logError: jest.fn() })
  app.use(express.json())
  app.use(errors.correlationId)
  app[method]('/target', asyncRoute(handler))
  app.use(errors.handler)
  return app
}

function expectCanonical(response: request.Response, code: string, message: string) {
  expect(response.status).toBe(500)
  expect(response.headers['x-request-id']).toBe(correlationId)
  expect(response.body).toEqual({ success: false, code, message, correlationId })
  expect(JSON.stringify(response.body)).not.toMatch(/secret|alice@example\.test|token=hidden/)
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('public technical-error boundary', () => {
  const renewalCases = [
    ['list', renewalController.listOffers, mockRenewalFind, 'RENEWAL_LIST_FAILED', 'Erro ao listar ofertas', 'get'],
    ['create', renewalController.createOffer, mockRenewalFindOne, 'RENEWAL_CREATE_FAILED', 'Erro ao criar oferta', 'post'],
    ['update', renewalController.updateOffer, mockRenewalFindByIdAndUpdate, 'RENEWAL_UPDATE_FAILED', 'Erro ao actualizar oferta', 'patch'],
    ['classes', renewalController.listTurmas, mockRenewalCoverage, 'RENEWAL_CLASSES_FAILED', 'Erro ao listar turmas', 'get'],
    ['performance', renewalController.performance, mockRenewalPerformance, 'RENEWAL_PERFORMANCE_FAILED', 'Erro ao calcular desempenho', 'get'],
    ['sync', renewalController.runSync, mockRenewalSync, 'RENEWAL_SYNC_FAILED', 'Erro ao sincronizar ofertas', 'post'],
  ] as const

  it.each(renewalCases)('centralizes renewal %s failures', async (_name, handler, dependency, code, message, method) => {
    if (dependency === mockRenewalFind) {
      dependency.mockReturnValue({ sort: () => ({ lean: () => ({ exec: () => Promise.reject(secret) }) }) })
    } else if (dependency === mockRenewalFindOne) {
      dependency.mockReturnValue({ exec: () => Promise.reject(secret) })
    } else {
      dependency.mockRejectedValueOnce(secret)
    }
    const response = await request(appFor(handler, method))[method]('/target' + offline)
      .send({ offerCode: 'offer' })
    expectCanonical(response, code, message)
  })

  it('returns the complete canonical renewal performance payload and forwards the selected year', async () => {
    const payload = {
      target: 0.2,
      year: 2026,
      availableYears: [2025, 2026],
      turmas: [{
        turmaNumber: 12,
        className: 'Turma 12',
        novaClassName: 'Turma 13',
        alunos: 10,
        renovados: 4,
        vendas: 5,
        taxa: 0.5,
        vsMeta: 0.3,
        expiry: '2026-12-31',
      }],
      totals: { renovacoes: 1, renovados: 4, vendas: 5, alunos: 10, taxaMedia: 0.5, acimaMeta: 1 },
    }
    mockRenewalPerformance.mockResolvedValueOnce(payload)

    const response = await request(appFor(renewalController.performance))
      .get('/target?year=2026&__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, data: payload })
    expect(mockRenewalPerformance).toHaveBeenCalledWith(2026)
  })

  it('preserves the canonical renewal performance envelope for an empty result', async () => {
    const payload = {
      target: 0.2,
      year: 2026,
      availableYears: [],
      turmas: [],
      totals: { renovacoes: 0, renovados: 0, vendas: 0, alunos: 0, taxaMedia: 0, acimaMeta: 0 },
    }
    mockRenewalPerformance.mockResolvedValueOnce(payload)

    const response = await request(appFor(renewalController.performance))
      .get('/target?__bo2_offline_loopback=1')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, data: payload })
    expect(mockRenewalPerformance).toHaveBeenCalledWith(undefined)
  })
  const trialCases = [
    ['list', trialController.getTrials, mockTrialList, 'GURU_TRIAL_LIST_FAILED', 'Erro ao listar trials'],
    ['stats', trialController.getTrialsStats, mockTrialStats, 'GURU_TRIAL_STATS_FAILED', 'Erro ao calcular estatísticas'],
    ['expired', trialController.checkExpired, mockTrialExpired, 'GURU_TRIAL_EXPIRED_CHECK_FAILED', 'Erro ao verificar trials expirados'],
    ['sync', trialController.syncTrials, mockTrialSync, 'GURU_TRIAL_SYNC_FAILED', 'Erro ao sincronizar trials'],
    ['revert', trialController.revertTrialMark, mockTrialRevert, 'GURU_TRIAL_REVERT_FAILED', 'Erro ao reverter trial'],
    ['inactivate', trialController.inactivateTrial, mockTrialInactivate, 'GURU_TRIAL_INACTIVATE_FAILED', 'Erro ao inativar trial'],
  ] as const

  it.each(trialCases)('centralizes unexpected Guru trial %s failures', async (_name, handler, dependency, code, message) => {
    dependency.mockRejectedValueOnce(secret)
    const response = await request(appFor(handler, 'post')).post('/target' + offline).send({ email: 'student@example.test' })
    expectCanonical(response, code, message)
  })

  it.each([
    [new TrialUserNotFoundError(), 'Utilizador não encontrado'],
    [new TrialNotEndedError(), 'Trial ainda não terminou'],
  ])('preserves safe Guru trial domain failures as 400', async (failure, message) => {
    mockTrialInactivate.mockRejectedValueOnce(failure)
    const response = await request(appFor(trialController.inactivateTrial, 'post'))
      .post('/target' + offline)
      .send({ email: 'student@example.test' })

    expect(response.status).toBe(400)
    expect(response.body).toEqual({ success: false, message })
  })
  it('centralizes webhook and sync-status failures', async () => {
    mockUserFindOne.mockRejectedValueOnce(secret)
    const email = await request(appFor(webhookController.emailOpened, 'post'))
      .post('/target' + offline)
      .send({ contact: { email: 'student@example.test' } })
    expectCanonical(email, 'AC_WEBHOOK_EMAIL_OPENED_FAILED', 'Erro ao registar abertura de email')

    mockLoggerInfo.mockImplementationOnce(() => {
      throw secret
    })
    const link = await request(appFor(webhookController.linkClicked, 'post'))
      .post('/target' + offline)
      .send({ contact: { email: 'student@example.test' }, link: 'https://example.test' })
    expectCanonical(link, 'AC_WEBHOOK_LINK_CLICKED_FAILED', 'Erro ao registar clique em link')

    mockUserCount.mockRejectedValueOnce(secret)
    const status = await request(appFor(getSyncStatus)).get('/target' + offline)
    expectCanonical(status, 'SYNC_STATUS_FAILED', 'Erro ao obter estado da sincronização')
  })

  it.each([
    ['/evaluate/student@example.test', mockUserFindOne, 'ACHIEVEMENTS_EVALUATE_FAILED', 'Erro ao avaliar conquistas'],
    ['/evaluate-all', mockAchievementAll, 'ACHIEVEMENTS_EVALUATE_ALL_FAILED', 'Erro na avaliação em massa'],
    ['/mark-seen', mockUserFindOne, 'ACHIEVEMENTS_MARK_SEEN_FAILED', 'Erro ao marcar conquistas como vistas'],
    ['/stats', mockUserAggregate, 'ACHIEVEMENTS_STATS_FAILED', 'Erro ao calcular estatísticas'],
  ] as const)('centralizes achievements failure at %s', async (path, dependency, code, message) => {
    dependency.mockRejectedValueOnce(secret)
    const app = express()
    const errors = createErrorHandling({ generateCorrelationId: () => correlationId, logError: jest.fn() })
    app.use(express.json())
    app.use(errors.correlationId)
    app.use('/api/achievements', achievementsRouter)
    app.use(errors.handler)
    const client = request(app)
    const response = path === '/stats'
      ? await client.get('/api/achievements' + path + offline)
      : await client.post('/api/achievements' + path + offline).send({ email: 'student@example.test', ids: ['a'] })
    expectCanonical(response, code, message)
  })

  it('preserves representative validation and not-found contracts', async () => {
    const renewal = await request(appFor(renewalController.createOffer, 'post')).post('/target' + offline).send({})
    expect(renewal.status).toBe(400)

    const guru = await request(appFor(trialController.inactivateTrial, 'post')).post('/target' + offline).send({})
    expect(guru.status).toBe(400)

    mockUserFindOne.mockResolvedValueOnce(null)
    const webhook = await request(appFor(webhookController.emailOpened, 'post'))
      .post('/target' + offline)
      .send({ contact: { email: 'missing@example.test' } })
    expect(webhook.status).toBe(404)
  })
})