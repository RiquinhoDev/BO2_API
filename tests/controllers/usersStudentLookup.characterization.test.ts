import express from 'express'
import request from 'supertest'
import type { Request, Response } from 'express'

const mockFindById = jest.fn()
const mockFindOne = jest.fn()
const mockUserProductFind = jest.fn()
const mockGetUserWithProducts = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { findById: mockFindById, findOne: mockFindOne },
}))

jest.mock('../../src/models', () => ({
  __esModule: true,
  UserProduct: { find: mockUserProductFind },
}))

jest.mock('../../src/services/userProducts/userProductService', () => ({
  __esModule: true,
  getUserWithProducts: mockGetUserWithProducts,
}))

import { createErrorHandling } from '../../src/security/errorHandling'
import { getUserAllClasses } from '../../src/services/users/studentClasses.runtime'
import { getUserByEmail, getUserById, getUserProducts } from '../../src/services/users/userLookup.runtime'

const LOOPBACK = '?__bo2_offline_loopback=1'

function withCentralBoundary(
  mount: (app: express.Express) => void,
): express.Express {
  const app = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'test-correlation-id',
    logError: () => undefined,
  })
  app.use(errorHandling.correlationId)
  mount(app)
  app.use(errorHandling.handler)
  return app
}

function leanResult<T>(value: T) {
  return { lean: jest.fn().mockResolvedValue(value) }
}

function populatedLean<T>(rows: T[]) {
  const query = {
    populate: jest.fn(),
    lean: jest.fn().mockResolvedValue(rows),
  }
  query.populate.mockReturnValue(query)
  return query
}

beforeEach(() => {
  mockFindById.mockReset()
  mockFindOne.mockReset()
  mockUserProductFind.mockReset()
  mockGetUserWithProducts.mockReset()
})

describe('getUserAllClasses — characterization', () => {
  function app(): express.Express {
    return withCentralBoundary(instance => {
      instance.get('/users/:userId/all-classes', getUserAllClasses)
    })
  }

  test('merges hotmart and curseduca enrolments and derives the stats block', async () => {
    mockFindById.mockReturnValue(
      leanResult({
        _id: 'user-1',
        email: 'user@example.test',
        name: 'User',
        hotmart: {
          enrolledClasses: [
            {
              classId: 'h-1',
              className: 'Hotmart One',
              isActive: true,
              enrolledAt: '2026-01-01',
            },
          ],
        },
        curseduca: {
          enrolledClasses: [
            {
              classId: 'c-1',
              className: 'Curseduca One',
              isActive: false,
              enteredAt: '2026-02-01',
              expiresAt: '2026-12-01',
              role: 'mentor',
              curseducaId: 55,
              curseducaUuid: 'uuid-55',
            },
          ],
        },
        combined: {
          primaryClass: { classId: 'h-1', className: 'Hotmart One', source: 'hotmart' },
        },
      }),
    )

    const response = await request(app())
      .get(`/users/user-1/all-classes${LOOPBACK}`)
      .expect(200)

    expect(response.body).toEqual({
      success: true,
      data: {
        userId: 'user-1',
        email: 'user@example.test',
        name: 'User',
        allClasses: [
          {
            classId: 'h-1',
            className: 'Hotmart One',
            source: 'hotmart',
            isActive: true,
            enrolledAt: '2026-01-01',
            role: 'student',
          },
          {
            classId: 'c-1',
            className: 'Curseduca One',
            source: 'curseduca',
            isActive: false,
            // curseduca maps `enteredAt` onto the shared `enrolledAt` field.
            enrolledAt: '2026-02-01',
            expiresAt: '2026-12-01',
            role: 'mentor',
            curseducaId: 55,
            curseducaUuid: 'uuid-55',
          },
        ],
        primaryClass: { classId: 'h-1', className: 'Hotmart One', source: 'hotmart' },
        stats: {
          totalClasses: 2,
          activeClasses: 1,
          hotmartClasses: 1,
          curseducaClasses: 1,
        },
      },
    })
  })

  test('returns an empty aggregate and a null primary class when nothing is enrolled', async () => {
    mockFindById.mockReturnValue(leanResult({ _id: 'user-1', email: 'a@b.test', name: 'A' }))

    const response = await request(app())
      .get(`/users/user-1/all-classes${LOOPBACK}`)
      .expect(200)

    expect(response.body.data.allClasses).toEqual([])
    expect(response.body.data.primaryClass).toBeNull()
    expect(response.body.data.stats).toEqual({
      totalClasses: 0,
      activeClasses: 0,
      hotmartClasses: 0,
      curseducaClasses: 0,
    })
  })

  test('ignores a non-array enrolledClasses instead of throwing', async () => {
    mockFindById.mockReturnValue(
      leanResult({ _id: 'user-1', hotmart: { enrolledClasses: 'corrupt' } }),
    )

    const response = await request(app())
      .get(`/users/user-1/all-classes${LOOPBACK}`)
      .expect(200)

    expect(response.body.data.allClasses).toEqual([])
  })

  test('returns 404 with the success:false envelope when the user is missing', async () => {
    mockFindById.mockReturnValue(leanResult(null))

    const response = await request(app())
      .get(`/users/missing/all-classes${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({
      success: false,
      message: 'Utilizador não encontrado',
    })
  })

  test('returns 400 when the route supplies no userId', async () => {
    // Unreachable through the mounted route; proven by direct invocation so the
    // guard is not silently dropped during extraction.
    const json = jest.fn()
    const status = jest.fn().mockReturnValue({ json })
    const next = jest.fn()

    await getUserAllClasses(
      { params: {} } as unknown as Request,
      { status } as unknown as Response,
      next,
    )

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'ID de utilizador é obrigatório',
    })
    expect(mockFindById).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  // DELIBERATE CHANGE (SEC-10): the legacy 500 body carried
  // `error: <raw error message>`; failures now reach the central boundary.
  test('routes failures through the central boundary without leaking detail', async () => {
    mockFindById.mockImplementation(() => {
      throw new Error('mongo exploded')
    })

    const response = await request(app())
      .get(`/users/user-1/all-classes${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'USER_CLASSES_FAILED',
      message: 'Erro ao buscar turmas do utilizador',
      correlationId: 'test-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })
})

describe('getUserById — characterization', () => {
  function app(): express.Express {
    return withCentralBoundary(instance => {
      instance.get('/users/:id', getUserById)
    })
  }

  test('delegates enrichment to getUserWithProducts and wraps it in the envelope', async () => {
    mockGetUserWithProducts.mockResolvedValue({ _id: 'user-1', products: [] })

    const response = await request(app())
      .get(`/users/user-1${LOOPBACK}`)
      .expect(200)

    expect(mockGetUserWithProducts).toHaveBeenCalledWith('user-1')
    expect(response.body).toEqual({
      success: true,
      data: { _id: 'user-1', products: [] },
    })
  })

  test('returns 404 with the English legacy message when enrichment yields nothing', async () => {
    mockGetUserWithProducts.mockResolvedValue(null)

    const response = await request(app())
      .get(`/users/missing${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({ success: false, message: 'User not found' })
  })

  test('routes failures through the central boundary without leaking detail', async () => {
    mockGetUserWithProducts.mockRejectedValue(new Error('mongo exploded'))

    const response = await request(app())
      .get(`/users/user-1${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'USER_LOOKUP_FAILED',
      message: 'Erro ao buscar utilizador',
      correlationId: 'test-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })
})

describe('getUserByEmail — canonical lookup', () => {
  function app(): express.Express {
    return withCentralBoundary(instance => {
      instance.get('/users/by-email/:email', getUserByEmail)
    })
  }

  test('decodes, trims and lowercases the email before returning enriched data', async () => {
    mockFindOne.mockReturnValue(leanResult({ _id: 'user-1' }))
    mockGetUserWithProducts.mockResolvedValue({
      _id: 'user-1',
      email: 'ana+curso@example.test',
      products: [{ _id: 'product-1' }],
    })

    const response = await request(app())
      .get(`/users/by-email/%20Ana%2BCurso%40Example.TEST%20${LOOPBACK}`)
      .expect(200)

    expect(mockFindOne).toHaveBeenCalledWith({ email: 'ana+curso@example.test' })
    expect(mockGetUserWithProducts).toHaveBeenCalledWith('user-1')
    expect(response.body).toEqual({
      success: true,
      data: {
        _id: 'user-1',
        email: 'ana+curso@example.test',
        products: [{ _id: 'product-1' }],
      },
    })
  })

  test('returns 404 when no normalized email matches', async () => {
    mockFindOne.mockReturnValue(leanResult(null))

    const response = await request(app())
      .get(`/users/by-email/missing%40example.test${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({ success: false, message: 'User not found' })
    expect(mockGetUserWithProducts).not.toHaveBeenCalled()
  })

  test('routes lookup failures through the central boundary', async () => {
    mockFindOne.mockImplementation(() => { throw new Error('mongo exploded') })

    const response = await request(app())
      .get(`/users/by-email/a%40example.test${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'USER_LOOKUP_FAILED',
      message: 'Erro ao buscar utilizador',
      correlationId: 'test-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })
})
describe('getUserProducts — characterization', () => {
  function app(): express.Express {
    return withCentralBoundary(instance => {
      instance.get('/users/:userId/products', getUserProducts)
    })
  }

  test('returns 200 with a count even when the user owns no products', async () => {
    mockUserProductFind.mockReturnValue(populatedLean([]))

    const response = await request(app())
      .get(`/users/user-1/products${LOOPBACK}`)
      .expect(200)

    // Deliberate legacy behaviour: no 404 for an unknown user, always 200.
    expect(response.body).toEqual({ success: true, data: [], meta: { count: 0 } })
  })

  test('queries by userId and populates product and user projections', async () => {
    const query = populatedLean([{ _id: 'up-1' }])
    mockUserProductFind.mockReturnValue(query)

    const response = await request(app())
      .get(`/users/user-1/products${LOOPBACK}`)
      .expect(200)

    expect(mockUserProductFind).toHaveBeenCalledWith({ userId: 'user-1' })
    expect(query.populate).toHaveBeenNthCalledWith(1, 'productId', 'name code platform')
    expect(query.populate).toHaveBeenNthCalledWith(2, 'userId', 'name email')
    expect(response.body).toEqual({
      success: true,
      data: [{ _id: 'up-1' }],
      meta: { count: 1 },
    })
  })

  test('routes failures through the central boundary without leaking detail', async () => {
    const failing = populatedLean<never>([])
    failing.lean.mockRejectedValue(new Error('mongo exploded'))
    mockUserProductFind.mockReturnValue(failing)

    const response = await request(app())
      .get(`/users/user-1/products${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'USER_PRODUCTS_FAILED',
      message: 'Erro ao buscar produtos do utilizador',
      correlationId: 'test-correlation-id',
    })
    expect(JSON.stringify(response.body)).not.toContain('mongo exploded')
  })
})
