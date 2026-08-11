import fs from 'node:fs'
import path from 'node:path'
import request from 'supertest'
import { installTestRuntimeConfigHooks } from '../support/runtimeConfig'
import { appForCentralError } from '../support/centralErrorContract'

installTestRuntimeConfigHooks()

const mockFindOne = jest.fn()
const mockFindById = jest.fn()
const mockSave = jest.fn()
const mockAddTags = jest.fn()
const mockGetTags = jest.fn()
const mockRemoveTags = jest.fn()
const mockUpdateTags = jest.fn()

const mockTestimonial = Object.assign(
  jest.fn(() => ({ save: mockSave })),
  {
    aggregate: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findOne: mockFindOne,
    findById: mockFindById,
    findByIdAndDelete: jest.fn(),
  },
)

jest.mock('../../src/models/Testimonial', () => ({ Testimonial: mockTestimonial }))
jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { aggregate: jest.fn(), find: jest.fn(), findById: jest.fn() },
}))
jest.mock('../../src/models/Class', () => ({ Class: { findOne: jest.fn() } }))
jest.mock('../../src/services/activeCampaign/activeCampaignService', () => ({
  __esModule: true,
  default: { removeTag: jest.fn() },
}))
jest.mock('../../src/controllers/testimonials/testimonialTags.service', () => ({
  addTestimonialTagsToUser: mockAddTags,
  getTestimonialTags: mockGetTags,
  removeTestimonialTagsFromUser: mockRemoveTags,
  updateTestimonialTagsOnCompletion: mockUpdateTags,
}))
jest.mock('../../src/utils/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}))

import testimonialsRouter from '../../src/routes/testimonials.routes'
import logger from '../../src/utils/logger'

const mockLoggerWarn = jest.mocked(logger.warn)

const objectId = '507f1f77bcf86cd799439011'
const offline = '?__bo2_offline_loopback=1'
const secret = new Error('alice@example.test alice%40example.test token=hidden')

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  jest.restoreAllMocks()
})

test('testimonial creation continues after a safe compensating tag event', async () => {
  mockFindOne.mockResolvedValueOnce(null)
  mockSave.mockResolvedValueOnce(undefined)
  mockGetTags.mockResolvedValueOnce(['CLAREZA_TESTEMUNHO'])
  mockAddTags.mockRejectedValueOnce(secret)

  const response = await request(
    appForCentralError({ kind: 'router', mountPath: '/', router: testimonialsRouter }),
  ).post('/' + offline).send({
    studentId: objectId,
    studentEmail: 'alice@example.test',
    studentName: 'Alice',
  })

  expect(response.status).toBe(201)
  expect(response.body.success).toBe(true)
  expect(mockSave).toHaveBeenCalledTimes(1)
  expect(mockLoggerWarn).toHaveBeenCalledWith(
    'Testimonial tag application failed',
    { studentId: objectId, status: 'partial' },
  )
  expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toMatch(
    /alice@example\.test|alice%40example\.test|token=hidden/,
  )
  expect(console.error).not.toHaveBeenCalled()
})

test('testimonial update preserves write order after a safe completion-tag event', async () => {
  const updateStatus = jest.fn().mockResolvedValue(undefined)
  const save = jest.fn().mockResolvedValue(undefined)
  mockFindById.mockResolvedValueOnce({
    _id: objectId,
    studentId: objectId,
    updateStatus,
    save,
  })
  mockUpdateTags.mockRejectedValueOnce(secret)

  const response = await request(
    appForCentralError({ kind: 'router', mountPath: '/', router: testimonialsRouter }),
  ).put(`/${objectId}${offline}`).send({ status: 'COMPLETED' })

  expect(response.status).toBe(200)
  expect(updateStatus).toHaveBeenCalledWith('COMPLETED', undefined)
  expect(save).toHaveBeenCalledTimes(1)
  expect(mockUpdateTags.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0])
  expect(mockLoggerWarn).toHaveBeenCalledWith(
    'Testimonial completion tag update failed',
    { testimonialId: objectId, status: 'partial' },
  )
  expect(JSON.stringify(mockLoggerWarn.mock.calls)).not.toMatch(
    /alice@example\.test|alice%40example\.test|token=hidden/,
  )
  expect(console.error).not.toHaveBeenCalled()
})

test('testimonial modules have no raw console or observability PII interpolation', () => {
  const files = [
    'src/controllers/testimonials/testimonialCandidates.controller.ts',
    'src/controllers/testimonials/testimonialCommands.controller.ts',
    'src/controllers/testimonials/testimonialTags.service.ts',
  ]
  const sources = files.map((file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')).join('\n')

  expect(sources).not.toMatch(/console\.(?:error|log|warn)/)
  expect(sources).not.toMatch(/logger\.(?:error|info|warn)[^\n]*(?:email|errorMessage)/i)
})
