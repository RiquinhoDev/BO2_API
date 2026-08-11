import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import express from 'express'
import request from 'supertest'

const mockIdentityService = {
  mergeIdentity: jest.fn(),
  manualMatch: jest.fn(),
  bulkMerge: jest.fn(),
  deleteReview: jest.fn(),
  deleteUnmatched: jest.fn(),
  deleteReviews: jest.fn(),
  deleteUnmatchedUsers: jest.fn(),
}

const mockUser = {
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn(),
  find: jest.fn(),
}
const mockUserProduct = {
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}
const mockUserHistory = {
  find: jest.fn(),
  aggregate: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  insertMany: jest.fn(),
  deleteMany: jest.fn(),
}
const mockSnapshotAndCompare = jest.fn()
const mockSyncHistory = { findById: jest.fn() }
const mockActivitySnapshotService = { getMonthlyStats: jest.fn() }
const mockConflictDetectionService = { getSyncConflicts: jest.fn() }

jest.mock('../../src/services/users/userIdentityReconciliation.runtime', () => ({
  userIdentityReconciliationService: mockIdentityService,
}))
jest.mock('../../src/models/user', () => ({ __esModule: true, default: mockUser }))
jest.mock('../../src/models/UserProduct', () => ({ __esModule: true, default: mockUserProduct }))
jest.mock('../../src/models/UserHistory', () => ({
  __esModule: true,
  default: mockUserHistory,
  ensureUserHistoryModel: () => mockUserHistory,
}))
jest.mock('../../src/services/snapshotServices/userSnapshot.service', () => ({
  snapshotAndCompare: mockSnapshotAndCompare,
}))
jest.mock('../../src/models/SyncModels/SyncHistory', () => ({
  __esModule: true,
  default: mockSyncHistory,
}))
jest.mock('../../src/services/syncUtilizadoresServices/activitySnapshot.service', () => ({
  __esModule: true,
  default: mockActivitySnapshotService,
}))
jest.mock('../../src/services/syncUtilizadoresServices/conflictDetection.service', () => ({
  __esModule: true,
  default: mockConflictDetectionService,
}))

import {
  bulkDeleteIds,
  bulkDeleteUnmatchedUsers,
  bulkMergeIds,
  deleteIdsDiferentes,
  deleteUnmatchedUser,
  manualMatch,
  mergeDiscordId,
} from '../../src/controllers/userIdentityReconciliation.controller'
import {
  createManualHistoryEntry,
  getAllHistory,
  getUserHistory,
} from '../../src/controllers/userHistory.controller'
import {
  deleteTestEvents,
  populateAllUsersHistory,
  populateRetroactiveHistory,
} from '../../src/controllers/populateHistory.controller'
import { makeTestChanges, revertTestChanges } from '../../src/controllers/testHistory.controller'
import {
  createMoveMultipleStudentsController,
  createMoveStudentController,
} from '../../src/controllers/classes/studentMovement.controller'
import { createGuruInactivationMaintenanceHandlers } from '../../src/controllers/guruInactivationMaintenance.controller'
import {
  getSnapshotStats,
  getSyncById,
} from '../../src/controllers/syncUtilizadoresControllers/syncStats.controller'
import {
  userIdentityBulkMergeInput,
  userIdentityManualMatchInput,
  userIdentityMergeInput,
} from '../../src/security/userIdentityInput'
import { testHistoryDeleteEventsInput } from '../../src/security/testHistoryDestructiveInput'
import { usersBulkDeleteInput, usersDeleteByIdInput } from '../../src/security/usersDestructiveInput'
import { withValidatedInput } from '../../src/security/validatedInput'
import type { GuruInactivationMaintenanceService } from '../../src/services/guru/guruInactivationMaintenance.service'

installTestRuntimeConfigHooks()

const loopback = '?__bo2_offline_loopback=1'
const objectId = '507f1f77bcf86cd799439011'

function identityApp() {
  const app = express()
  app.use(express.json())
  app.post('/merge', withValidatedInput(userIdentityMergeInput, mergeDiscordId))
  app.post('/manual', withValidatedInput(userIdentityManualMatchInput, manualMatch))
  app.post('/bulk-merge', withValidatedInput(userIdentityBulkMergeInput, bulkMergeIds))
  app.delete('/review/:id', withValidatedInput(usersDeleteByIdInput, deleteIdsDiferentes))
  app.delete('/unmatched/:id', withValidatedInput(usersDeleteByIdInput, deleteUnmatchedUser))
  app.post('/bulk-delete', withValidatedInput(usersBulkDeleteInput, bulkDeleteIds))
  app.post('/bulk-delete-unmatched', withValidatedInput(usersBulkDeleteInput, bulkDeleteUnmatchedUsers))
  return app
}

function queryChain(rows: unknown[]) {
  const chain = {
    sort: jest.fn(),
    skip: jest.fn(),
    limit: jest.fn(),
    populate: jest.fn(),
    lean: jest.fn().mockResolvedValue(rows),
  }
  chain.sort.mockReturnValue(chain)
  chain.skip.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  chain.populate.mockReturnValue(chain)
  return chain
}

function userHistoryApp() {
  const app = express()
  app.use(express.json())
  app.get('/user', getUserHistory)
  app.get('/all', getAllHistory)
  app.post('/manual', createManualHistoryEntry)
  return app
}

function populateHistoryApp() {
  const app = express()
  app.use(express.json())
  app.post('/retroactive', populateRetroactiveHistory)
  app.post(
    '/delete-test-events',
    withValidatedInput(testHistoryDeleteEventsInput, (input, _req, res, next) =>
      deleteTestEvents(input, res, next)),
  )
  app.post('/all', populateAllUsersHistory)
  return app
}

function testHistoryApp() {
  const app = express()
  app.use(express.json())
  app.post('/make', makeTestChanges)
  app.post('/revert', revertTestChanges)
  return app
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'log').mockImplementation(() => undefined)
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('ARCH03 partition C canonical response contracts', () => {
  describe('user identity reconciliation', () => {
    test('wraps mergeDiscordId user data and message metadata', async () => {
      mockIdentityService.mergeIdentity.mockResolvedValueOnce({
        id: 'user-1', email: 'student@example.test', discordIds: ['discord-1'],
      })

      const response = await request(identityApp()).post('/merge' + loopback).send({
        email: 'student@example.test', newDiscordId: 'discord-1',
      })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { email: 'student@example.test', discordIds: ['discord-1'] },
        meta: { message: 'Merge concluído com sucesso.' },
      })
    })

    test('wraps manualMatch user data and message metadata', async () => {
      mockIdentityService.manualMatch.mockResolvedValueOnce({
        id: 'user-1', email: 'student@example.test', name: 'Student', discordIds: ['discord-1'],
      })

      const response = await request(identityApp()).post('/manual' + loopback).send({
        email: 'student@example.test', discordId: 'discord-1',
      })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { email: 'student@example.test', name: 'Student', discordIds: ['discord-1'] },
        meta: { message: 'Correspondência manual criada com sucesso.' },
      })
    })

    test('preserves bulkMerge partial errors under data', async () => {
      mockIdentityService.bulkMerge.mockResolvedValueOnce({ mergedCount: 1, errors: ['review-2 failed'] })

      const response = await request(identityApp()).post('/bulk-merge' + loopback).send({ ids: ['review-1', 'review-2'] })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { mergedCount: 1, errors: ['review-2 failed'] },
        meta: { message: '1 merges concluídos com sucesso.' },
      })
    })

    test('wraps deleteIdsDiferentes no-data success', async () => {
      mockIdentityService.deleteReview.mockResolvedValueOnce(true)

      const response = await request(identityApp()).delete('/review/review-1' + loopback)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: null,
        meta: { message: 'Registo removido com sucesso.' },
      })
    })

    test('wraps deleteUnmatchedUser no-data success', async () => {
      mockIdentityService.deleteUnmatched.mockResolvedValueOnce(true)

      const response = await request(identityApp()).delete('/unmatched/unmatched-1' + loopback)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: null,
        meta: { message: 'Utilizador apagado com sucesso.' },
      })
    })

    test('wraps bulkDeleteIds count data', async () => {
      mockIdentityService.deleteReviews.mockResolvedValueOnce(2)

      const response = await request(identityApp()).post('/bulk-delete' + loopback).send({ ids: ['a', 'b'] })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { deletedCount: 2 },
        meta: { message: '2 registos eliminados com sucesso.' },
      })
    })

    test('wraps bulkDeleteUnmatchedUsers count data', async () => {
      mockIdentityService.deleteUnmatchedUsers.mockResolvedValueOnce(3)

      const response = await request(identityApp()).post('/bulk-delete-unmatched' + loopback).send({ ids: ['a', 'b', 'c'] })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { deletedCount: 3 },
        meta: { message: '3 utilizadores não correspondidos eliminados.' },
      })
    })
  })

  describe('user history', () => {
    test('moves user-history pagination and timestamp to meta', async () => {
      mockUserHistory.find.mockReturnValueOnce(queryChain([{ changeType: 'CLASS_CHANGE' }]))
      mockUserHistory.aggregate.mockResolvedValueOnce([
        { _id: 'CLASS_CHANGE', count: 1, lastChange: '2026-08-11T00:00:00.000Z' },
      ])

      const response = await request(userHistoryApp()).get('/user?email=STUDENT%40EXAMPLE.TEST&limit=5&__bo2_offline_loopback=1')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        success: true,
        data: {
          history: [{ changeType: 'CLASS_CHANGE' }],
          summary: { totalChanges: 1, hasClassChanges: true },
        },
        meta: { pagination: { limit: 5, total: 1, hasMore: false }, timestamp: expect.any(String) },
      })
      expect(Object.keys(response.body).sort()).toEqual(['data', 'meta', 'success'])
    })

    test('moves all-history pagination and timestamp to meta', async () => {
      mockUserHistory.find.mockReturnValueOnce(queryChain([{ changeType: 'MANUAL_EDIT' }]))
      mockUserHistory.countDocuments.mockResolvedValueOnce(21)
      mockUserHistory.aggregate.mockResolvedValueOnce([
        { _id: { changeType: 'MANUAL_EDIT', source: 'MANUAL' }, count: 1, lastChange: '2026-08-11T00:00:00.000Z' },
      ])

      const response = await request(userHistoryApp()).get('/all?page=2&limit=20&__bo2_offline_loopback=1')

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        success: true,
        data: { history: [{ changeType: 'MANUAL_EDIT' }], stats: { MANUAL_EDIT_MANUAL: { count: 1 } } },
        meta: {
          pagination: { page: 2, limit: 20, total: 21, totalPages: 2, hasNext: false, hasPrev: true },
          timestamp: expect.any(String),
        },
      })
      expect(Object.keys(response.body).sort()).toEqual(['data', 'meta', 'success'])
    })

    test('wraps a manual history entry and preserves 201', async () => {
      const entry = { _id: 'history-1', userEmail: 'student@example.test', changeType: 'MANUAL_EDIT' }
      mockUserHistory.create.mockResolvedValueOnce(entry)

      const response = await request(userHistoryApp()).post('/manual' + loopback).send({
        userId: objectId, userEmail: 'student@example.test', changeType: 'MANUAL_EDIT',
      })

      expect(response.status).toBe(201)
      expect(response.body).toEqual({
        success: true,
        data: entry,
        meta: { message: 'Entrada de histórico criada com sucesso' },
      })
    })
  })

  describe('history population', () => {
    test('wraps retroactive population data without changing writes', async () => {
      mockUser.findOne.mockResolvedValueOnce({ _id: objectId, email: 'student@example.test' })
      mockUserProduct.find.mockReturnValueOnce({
        populate: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([]) }),
      })

      const response = await request(populateHistoryApp()).post('/retroactive' + loopback).send({ email: 'student@example.test' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: {
          userId: objectId,
          email: 'student@example.test',
          productsProcessed: 0,
          historyRecordsCreated: 0,
          events: [],
        },
        meta: { message: 'Histórico retroativo criado com sucesso' },
      })
      expect(mockUserHistory.insertMany).not.toHaveBeenCalled()
    })

    test('wraps delete-test-events result after both compensating writes', async () => {
      mockUserHistory.deleteMany.mockResolvedValueOnce({ deletedCount: 2 })
      mockUser.findOneAndUpdate.mockResolvedValueOnce({ _id: objectId })

      const response = await request(populateHistoryApp()).post('/delete-test-events' + loopback).send({ email: 'student@example.test' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { deletedCount: 2 },
        meta: { message: 'Eventos de teste apagados com sucesso' },
      })
      expect(mockUser.findOneAndUpdate).toHaveBeenCalledTimes(1)
    })

    test('keeps per-user failures isolated in populate-all and wraps totals', async () => {
      mockUser.find.mockReturnValueOnce({
        limit: jest.fn().mockReturnValue({
          select: jest.fn().mockResolvedValue([
            { _id: 'user-1', email: 'one@example.test' },
            { _id: 'user-2', email: 'two@example.test' },
          ]),
        }),
      })
      mockUserProduct.find
        .mockReturnValueOnce({ populate: jest.fn().mockRejectedValue(new Error('first failed')) })
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue([{ _id: 'product-2' }]) })

      const response = await request(populateHistoryApp()).post('/all' + loopback).send({ limit: 2 })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { usersProcessed: 1, totalRecords: 0 },
        meta: { message: 'Histórico retroativo criado para 1 users' },
      })
    })
  })

  describe('test history mutations', () => {
    test('wraps make-changes data after ordered writes and comparison', async () => {
      const user = { _id: objectId, email: 'student@example.test', name: 'Student', combined: { combinedEngagement: 50 } }
      mockUser.findOne.mockResolvedValueOnce(user)
      mockUser.findById.mockResolvedValueOnce(user)
      mockUser.findByIdAndUpdate.mockResolvedValue(user)
      mockUserProduct.find
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue([]) })
      mockSnapshotAndCompare
        .mockResolvedValueOnce({ comparison: { summary: {}, changes: [] } })
        .mockResolvedValueOnce({
          comparison: {
            summary: { totalChanges: 1, highPriorityChanges: 0, mediumPriorityChanges: 1, lowPriorityChanges: 0 },
            changes: [],
          },
        })

      const response = await request(testHistoryApp()).post('/make' + loopback).send({ email: user.email })

      expect(response.status).toBe(200)
      expect(response.body).toMatchObject({
        success: true,
        data: { userId: objectId, email: user.email, comparison: { totalChanges: 1 } },
        meta: { message: 'Alterações de teste realizadas com sucesso' },
      })
      expect(mockUser.findByIdAndUpdate).toHaveBeenCalledTimes(2)
    })

    test('wraps revert result after user, products, and snapshot writes', async () => {
      const originalState = { userId: objectId, name: 'Student', averageEngagement: 50, products: [] }
      mockUser.findByIdAndUpdate.mockResolvedValueOnce({ _id: objectId })
      mockUser.findById.mockResolvedValueOnce({ _id: objectId })
      mockUserProduct.find.mockReturnValueOnce({ populate: jest.fn().mockResolvedValue([]) })
      mockSnapshotAndCompare.mockResolvedValueOnce({ comparison: { summary: {}, changes: [] } })

      const response = await request(testHistoryApp()).post('/revert' + loopback).send({ originalState })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { userId: objectId, productsReverted: 0 },
        meta: { message: 'Alterações revertidas com sucesso' },
      })
      expect(mockSnapshotAndCompare).toHaveBeenCalledTimes(1)
    })
  })

  describe('student movement', () => {
    test('wraps one movement and keeps message/timestamp metadata', async () => {
      const moveOne = jest.fn().mockResolvedValue({ movement: { studentId: 'student-1' }, timestamp: '2026-08-11T00:00:00.000Z' })
      const app = express()
      app.use(express.json())
      app.post('/move', createMoveStudentController({ moveOne }))

      const response = await request(app).post('/move' + loopback).send({ studentId: 'student-1', toClassId: 'class-2' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { studentId: 'student-1' },
        meta: { message: 'Estudante movido com sucesso', timestamp: '2026-08-11T00:00:00.000Z' },
      })
    })

    test('wraps partial batch results without changing error isolation', async () => {
      const results = { success: [{ studentId: 'student-1' }], errors: [{ studentId: 'student-2', error: 'missing' }] }
      const moveMany = jest.fn().mockResolvedValue({ results, timestamp: '2026-08-11T00:00:00.000Z' })
      const app = express()
      app.use(express.json())
      app.post('/move-many', createMoveMultipleStudentsController({ moveMany }))

      const response = await request(app).post('/move-many' + loopback).send({ studentIds: ['student-1', 'student-2'], toClassId: 'class-2' })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: results,
        meta: {
          message: 'Movimentação concluída: 1 sucessos, 1 erros',
          timestamp: '2026-08-11T00:00:00.000Z',
        },
      })
    })
  })

  describe('Guru inactivation maintenance', () => {
    function maintenanceService(): GuruInactivationMaintenanceService {
      return {
        cleanup: jest.fn().mockResolvedValue({
          cleanedInactive: 2,
          cleanedGuruActive: 1,
          kept: 4,
          total: 7,
          details: [{ email: 'student@example.test', reason: 'inactive' }],
        }),
        diagnose: jest.fn().mockResolvedValue([{ email: 'student@example.test', guruStatus: 'active' }]),
      }
    }

    test('wraps cleanup domain totals and message metadata', async () => {
      const app = express()
      const handlers = createGuruInactivationMaintenanceHandlers(maintenanceService())
      app.post('/cleanup', handlers.cleanupInactivationList)

      const response = await request(app).post('/cleanup' + loopback)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: {
          cleaned: { total: 3, curseducaInactive: 2, guruActive: 1 },
          kept: 4,
          total: 7,
          cleanedDetails: [{ email: 'student@example.test', reason: 'inactive' }],
        },
        meta: { message: 'Limpeza concluída: 3 removidos (2 CursEduca INACTIVE, 1 Guru ACTIVE), 4 mantidos' },
      })
    })

    test('wraps diagnose results as the response data', async () => {
      const app = express()
      app.use(express.json())
      const handlers = createGuruInactivationMaintenanceHandlers(maintenanceService())
      app.post('/diagnose', handlers.diagnoseUsers)

      const response = await request(app).post('/diagnose' + loopback).send({ emails: ['student@example.test'] })

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: [{ email: 'student@example.test', guruStatus: 'active' }],
      })
    })
  })

  describe('sync statistics', () => {
    test('wraps sync details and message metadata', async () => {
      const chain = queryChain([{ id: 'unused' }])
      chain.lean.mockResolvedValueOnce({ _id: objectId, status: 'completed' })
      mockSyncHistory.findById.mockReturnValueOnce(chain)
      mockConflictDetectionService.getSyncConflicts.mockResolvedValueOnce([
        { _id: 'conflict-1', conflictType: 'EMAIL', severity: 'HIGH', title: 'Email', status: 'PENDING', detectedAt: '2026-08-11' },
      ])
      const app = express()
      app.get('/sync/:id', getSyncById)

      const response = await request(app).get(`/sync/${objectId}${loopback}`)

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: {
          sync: { _id: objectId, status: 'completed' },
          conflicts: [{ id: 'conflict-1', type: 'EMAIL', severity: 'HIGH', title: 'Email', status: 'PENDING', detectedAt: '2026-08-11' }],
        },
        meta: { message: 'Sync recuperado com sucesso' },
      })
    })

    test('wraps snapshot stats and message metadata', async () => {
      mockActivitySnapshotService.getMonthlyStats.mockResolvedValueOnce({ active: 4 })
      const app = express()
      app.get('/snapshots', getSnapshotStats)

      const response = await request(app).get('/snapshots?month=2026-08-01&platform=HOTMART&__bo2_offline_loopback=1')

      expect(response.status).toBe(200)
      expect(response.body).toEqual({
        success: true,
        data: { month: '2026-08', platform: 'HOTMART', stats: { active: 4 } },
        meta: { message: 'Estatísticas de snapshots recuperadas' },
      })
    })
  })
})
