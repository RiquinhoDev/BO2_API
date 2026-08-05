import express from 'express'
import request from 'supertest'

const mockAggregate = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { aggregate: mockAggregate },
}))

import { listUsers } from '../../src/controllers/users.controller'

const LOOPBACK = '__bo2_offline_loopback=1'

function app(): express.Express {
  const instance = express()
  instance.get('/users/listUsers', listUsers)
  // The legacy Backoffice reaches the same handler through this second mount.
  instance.get('/users/users/listUsers', listUsers)
  return instance
}

/** First aggregate call returns the rows, the second returns the count facet. */
function respondWith(rows: unknown[], total?: number) {
  mockAggregate
    .mockResolvedValueOnce(rows)
    .mockResolvedValueOnce(total === undefined ? [] : [{ total }])
}

function pipelines() {
  return {
    rows: mockAggregate.mock.calls[0][0],
    count: mockAggregate.mock.calls[1][0],
  }
}

function stage(pipeline: Record<string, unknown>[], name: string) {
  return pipeline.find(entry => Object.prototype.hasOwnProperty.call(entry, name))
}

beforeEach(() => {
  mockAggregate.mockReset()
})

describe('listUsers — the contract the legacy Backoffice depends on', () => {
  test('returns users and count at the top level, as the Backoffice reads them', async () => {
    respondWith([{ _id: 'u1', name: 'Ana' }], 137)

    const response = await request(app())
      .get(`/users/listUsers?page=1&limit=10&${LOOPBACK}`)
      .expect(200)

    // DiscordBot.jsx and HotmartSync.jsx read exactly these two fields.
    expect(response.body.users).toEqual([{ _id: 'u1', name: 'Ana' }])
    expect(response.body.count).toBe(137)
  })

  test('echoes the pagination inputs and derives totalPages', async () => {
    respondWith([], 137)

    const response = await request(app())
      .get(`/users/listUsers?page=3&limit=20&${LOOPBACK}`)
      .expect(200)

    expect(response.body).toMatchObject({
      page: 3,
      limit: 20,
      totalPages: 7,
      hasProgress: true,
    })
  })

  test('exposes the full legacy envelope', async () => {
    respondWith([], 0)

    const response = await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    expect(Object.keys(response.body).sort()).toEqual([
      'count',
      'filters',
      'hasProgress',
      'limit',
      'page',
      'totalPages',
      'users',
    ])
    expect(response.body.filters).toEqual({
      search: null,
      status: null,
      hasDiscord: null,
      hasHotmart: null,
    })
  })

  test('defaults to page 1 and limit 50 with no skip', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    const { rows } = pipelines()
    expect(stage(rows, '$skip')).toEqual({ $skip: 0 })
    expect(stage(rows, '$limit')).toEqual({ $limit: 50 })
  })

  test('computes skip from the one-based page the Backoffice sends', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?page=4&limit=25&${LOOPBACK}`)
      .expect(200)

    const { rows } = pipelines()
    expect(stage(rows, '$skip')).toEqual({ $skip: 75 })
    expect(stage(rows, '$limit')).toEqual({ $limit: 25 })
  })

  test('reports zero pages when nothing matches', async () => {
    respondWith([], undefined)

    const response = await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    // An empty count facet folds to 0 rather than undefined.
    expect(response.body.count).toBe(0)
    expect(response.body.totalPages).toBe(0)
  })

  test('serves the /users/users/listUsers mount with the identical contract', async () => {
    respondWith([{ _id: 'u1' }], 1)
    const canonical = await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    mockAggregate.mockReset()
    respondWith([{ _id: 'u1' }], 1)
    const duplicated = await request(app())
      .get(`/users/users/listUsers?${LOOPBACK}`)
      .expect(200)

    expect(duplicated.body).toEqual(canonical.body)
  })
})

describe('listUsers — pipeline shape', () => {
  test('keeps the stage order the projection depends on', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    const { rows } = pipelines()
    expect(rows.map((entry: object) => Object.keys(entry)[0])).toEqual([
      '$match',
      '$lookup',
      '$unwind',
      '$project',
      '$sort',
      '$skip',
      '$limit',
    ])
  })

  test('joins class names and keeps users without a class', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    const { rows } = pipelines()
    expect(stage(rows, '$lookup')).toEqual({
      $lookup: {
        from: 'classes',
        localField: 'classId',
        foreignField: 'classId',
        as: 'classInfo',
      },
    })
    expect(stage(rows, '$unwind')).toEqual({
      $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true },
    })
  })

  test('projects every field the Backoffice tables render', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    const projection = (stage(pipelines().rows, '$project') as { $project: Record<string, unknown> })
      .$project

    // Columns bound in DiscordBot.jsx and HotmartSync.jsx.
    for (const field of [
      'discordIds', 'username', 'hotmartUserId', 'name',
      'email', 'classId', 'status', 'purchaseDate', 'engagement',
    ]) {
      expect(projection).toHaveProperty(field)
    }
    expect(projection.className).toBe('$classInfo.name')
    expect(projection).toHaveProperty('progress', 1)
    // Derived booleans that ship with every row.
    expect(projection).toHaveProperty('hasDiscordIds')
    expect(projection).toHaveProperty('hasHotmartConnection')
    expect(projection).toHaveProperty('hasProgress')
  })

  test('sorts by name ascending', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(200)

    expect(stage(pipelines().rows, '$sort')).toEqual({ $sort: { name: 1 } })
  })

  test('counts with the same match stage and nothing else', async () => {
    respondWith([], 0)

    await request(app())
      .get(`/users/listUsers?search=ana&${LOOPBACK}`)
      .expect(200)

    const { rows, count } = pipelines()
    expect(count).toHaveLength(2)
    expect(count[0]).toEqual(stage(rows, '$match'))
    expect(count[1]).toEqual({ $count: 'total' })
  })
})

describe('listUsers — filters', () => {
  /** Resets first so the helper can be used more than once in a test. */
  async function matchFor(query: string) {
    mockAggregate.mockReset()
    respondWith([], 0)
    await request(app()).get(`/users/listUsers?${query}&${LOOPBACK}`).expect(200)
    return (stage(pipelines().rows, '$match') as { $match: Record<string, unknown> }).$match
  }

  test('has an empty match stage without filters', async () => {
    expect(await matchFor('')).toEqual({})
  })

  test('searches name, email and username with a case-insensitive regex', async () => {
    expect(await matchFor('search=ana')).toEqual({
      $or: [
        { name: { $regex: 'ana', $options: 'i' } },
        { email: { $regex: 'ana', $options: 'i' } },
        { username: { $regex: 'ana', $options: 'i' } },
      ],
    })
  })

  test('CURRENT: the search term reaches Mongo as an unescaped pattern', async () => {
    const match = await matchFor(`search=${encodeURIComponent('a.*b')}`)
    const first = (match.$or as Record<string, { $regex: string }>[])[0]

    // Passed as a string to $regex, so Mongo compiles it — the metacharacters
    // stay active. Hardening is a separate slice.
    expect(first.name.$regex).toBe('a.*b')
  })

  test('filters by status verbatim', async () => {
    expect(await matchFor('status=ACTIVE')).toEqual({ status: 'ACTIVE' })
  })

  test('translates hasDiscord true and false', async () => {
    expect(await matchFor('hasDiscord=true')).toEqual({
      discordIds: { $exists: true, $not: { $size: 0 } },
    })
    expect(await matchFor('hasDiscord=false')).toEqual({
      $or: [{ discordIds: { $exists: false } }, { discordIds: { $size: 0 } }],
    })
  })

  test('treats any other hasDiscord value as no filter', async () => {
    expect(await matchFor('hasDiscord=maybe')).toEqual({})
  })

  test('echoes the applied filters back to the caller', async () => {
    respondWith([], 0)
    const response = await request(app())
      .get(`/users/listUsers?search=ana&status=ACTIVE&hasDiscord=true&hasHotmart=false&${LOOPBACK}`)
      .expect(200)

    expect(response.body.filters).toEqual({
      search: 'ana',
      status: 'ACTIVE',
      hasDiscord: 'true',
      hasHotmart: 'false',
    })
  })

  // ─────────────────────────────────────────────────────────────────────────
  // BUG, characterised so the fix is visible as a fix.
  //
  // search, hasDiscord=false and hasHotmart=true each assign `matchStage.$or`
  // outright. Combining them silently drops the earlier filter: the response
  // still echoes every filter under `filters`, so the caller is told a filter
  // was applied that never reached the query.
  // ─────────────────────────────────────────────────────────────────────────
  test('BUG: hasDiscard=false discards the search filter', async () => {
    const match = await matchFor('search=ana&hasDiscord=false')

    expect(match.$or).toEqual([
      { discordIds: { $exists: false } },
      { discordIds: { $size: 0 } },
    ])
    // The search terms are gone from the query entirely.
    expect(JSON.stringify(match)).not.toContain('ana')
  })

  test('BUG: hasHotmart=true discards both search and hasDiscord', async () => {
    const match = await matchFor('search=ana&hasDiscord=false&hasHotmart=true')

    expect(JSON.stringify(match)).not.toContain('ana')
    expect(JSON.stringify(match)).not.toContain('discordIds')
    expect(match.$or).toHaveLength(2)
  })

  test('BUG: the response still reports the filters that were dropped', async () => {
    respondWith([], 0)
    const response = await request(app())
      .get(`/users/listUsers?search=ana&hasHotmart=true&${LOOPBACK}`)
      .expect(200)

    expect(response.body.filters.search).toBe('ana')
    const match = (stage(pipelines().rows, '$match') as { $match: Record<string, unknown> }).$match
    expect(JSON.stringify(match)).not.toContain('ana')
  })

  test('hasHotmart=false uses $and and therefore survives alongside search', async () => {
    const match = await matchFor('search=ana&hasHotmart=false')

    // The only branch that composes instead of overwriting.
    expect(match.$or).toBeDefined()
    expect(match.$and).toBeDefined()
    expect(JSON.stringify(match.$or)).toContain('ana')
  })
})

describe('listUsers — current failure contract', () => {
  test('CURRENT: the 500 body leaks the internal error message', async () => {
    mockAggregate.mockRejectedValue(new Error('mongo exploded'))

    const response = await request(app())
      .get(`/users/listUsers?${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      message: 'Erro ao buscar utilizadores',
      details: 'mongo exploded',
    })
  })
})
