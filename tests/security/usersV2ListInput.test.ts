import express from 'express'
import request from 'supertest'
import { createErrorHandling } from '../../src/security/errorHandling'
import {
  usersV2EnrollmentInput,
  usersV2LegacyInput,
  usersV2OverviewAnalyticsInput,
} from '../../src/security/usersV2ListInput'
import { withValidatedInput } from '../../src/security/validatedInput'

const emptyInput = {
  params: {},
  query: {},
  body: {},
}

function validationApp() {
  const app = express()
  const errors = createErrorHandling({
    generateCorrelationId: () => 'users-v2-list-input-id',
    logError: jest.fn(),
  })

  app.use(express.json())
  app.use(errors.correlationId)
  app.all('/legacy', withValidatedInput(usersV2LegacyInput, (input, _req, res) => {
    res.status(200).json(input)
  }))
  app.use(errors.handler)
  return app
}

describe('users V2 enrollment input', () => {
  it('normalizes its canonical filters and caps its limit', () => {
    const parsed = usersV2EnrollmentInput.parse({
      params: {},
      query: {
        page: '2',
        limit: '10000',
        platform: 'HOTMART',
        engagementLevel: 'NONE,ALTO',
        minEngagement: '20',
        maxEngagement: '80',
      },
      body: {},
    })

    expect(parsed.query).toEqual(expect.objectContaining({
      page: 2,
      limit: 200,
      platform: 'hotmart',
      engagementLevel: ['NONE', 'ALTO'],
      minEngagement: 20,
      maxEngagement: 80,
    }))
  })

  it('defaults canonical pagination', () => {
    expect(usersV2EnrollmentInput.parse(emptyInput).query).toEqual({
      page: 1,
      limit: 50,
    })
  })

  it.each([
    [{ status: 'active' }],
    [{ progressLevel: 'baixo' }],
    [{ engagementLevel: 'ALTO,unknown' }],
    [{ productId: 'not-an-object-id' }],
    [{ lastAccessBefore: '2026-07-30' }],
    [{ enrolledAfter: '2026-07-30T12:00:00' }],
    [{ minEngagement: '81', maxEngagement: '80' }],
    [{ unknown: 'value' }],
  ])('rejects invalid or unknown canonical query: %o', query => {
    expect(usersV2EnrollmentInput.safeParse({
      params: {},
      query,
      body: {},
    }).success).toBe(false)
  })

  it('accepts no query fields for overview analytics', () => {
    expect(usersV2OverviewAnalyticsInput.parse(emptyInput)).toEqual(emptyInput)
  })

  it('defaults legacy pagination to the unchanged handler limit of 50', () => {
    const parsed = usersV2LegacyInput.parse(emptyInput)

    expect(parsed.query).toEqual({
      canonical: {
        page: 1,
        limit: 50,
      },
      responseFilters: {},
    })
  })

  it('caps legacy limits while retaining the old topPercentage response name', () => {
    const parsed = usersV2LegacyInput.parse({
      params: {},
      query: { limit: '10000', topPercentage: '0', benign: 'x' },
      body: {},
    })

    expect(parsed.query).toEqual({
      canonical: {
        page: 1,
        limit: 100,
        minEngagement: 77,
      },
      responseFilters: {
        topPercentage: '0',
      },
    })
    expect(parsed.query).not.toHaveProperty('benign')
  })

  it('lets topPercentage override maxEngagement only in canonical filters', () => {
    const parsed = usersV2LegacyInput.parse({
      params: {},
      query: {
        maxEngagement: '80',
        topPercentage: '10',
      },
      body: {},
    })

    expect(parsed.query).toEqual({
      canonical: {
        page: 1,
        limit: 50,
        minEngagement: 77,
      },
      responseFilters: {
        maxEngagement: '80',
        topPercentage: '10',
      },
    })
  })

  it('ignores invalid legacy optional filters instead of rejecting the list', () => {
    const parsed = usersV2LegacyInput.parse({
      params: {},
      query: {
        platform: 'unknown',
        productId: 'not-an-object-id',
        status: 'active',
        search: '',
        progressLevel: 'unknown',
        engagementLevel: 'ALTO,unknown',
        minEngagement: '101',
        maxEngagement: '-1',
        lastAccessBefore: '2026-07-30',
        enrolledAfter: '2026-07-30T12:00:00',
      },
      body: {},
    })

    expect(parsed.query).toEqual({
      canonical: {
        page: 1,
        limit: 50,
      },
      responseFilters: {},
    })
  })

  it('rejects operator and dotted keys before legacy parsing', async () => {
    for (const query of [
      '$where=x',
      'filter.name=x',
    ]) {
      const response = await request(validationApp())
        .get(`/legacy?${query}&__bo2_offline_loopback=1`)

      expect(response.status).toBe(400)
      expect(response.body).toMatchObject({
        success: false,
        code: 'INVALID_REQUEST',
        correlationId: 'users-v2-list-input-id',
      })
    }
  })

  it('rejects a literal prototype key before legacy parsing', async () => {
    const body = JSON.parse('{"__proto__":{"polluted":true}}')
    expect(Object.getOwnPropertyNames(body)).toContain('__proto__')

    const response = await request(validationApp())
      .post('/legacy?__bo2_offline_loopback=1')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body))

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      success: false,
      code: 'INVALID_REQUEST',
      correlationId: 'users-v2-list-input-id',
    })
    expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted'))
      .toBeUndefined()
  })
})
