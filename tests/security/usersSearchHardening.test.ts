import express from 'express'
import request from 'supertest'

const mockUserFind = jest.fn()
const mockUserProductFind = jest.fn()

jest.mock('../../src/models/user', () => ({
  __esModule: true,
  default: { find: mockUserFind },
}))

jest.mock('../../src/models', () => ({
  __esModule: true,
  UserProduct: { find: mockUserProductFind },
}))

import { createErrorHandling } from '../../src/security/errorHandling'
import {
  MAX_CRITERION_LENGTH,
  MAX_SEARCH_RESULTS,
  SEARCH_FETCH_LIMIT,
} from '../../src/services/users/studentSearch.contract'
import { searchStudent } from '../../src/services/users/studentSearch.runtime'

const LOOPBACK = '__bo2_offline_loopback=1'

type Chain = {
  select: jest.Mock
  populate: jest.Mock
  sort: jest.Mock
  limit: jest.Mock
  lean: jest.Mock
  calls: string[]
}

function chain<T>(rows: T[]): Chain {
  const calls: string[] = []
  const record = (name: string) => jest.fn((...args: unknown[]) => {
    calls.push(name)
    void args
    return query
  })

  const query: Chain = {
    select: record('select'),
    populate: record('populate'),
    sort: record('sort'),
    limit: record('limit'),
    lean: jest.fn().mockResolvedValue(rows),
    calls,
  }
  return query
}

function app(): express.Express {
  const instance = express()
  const errorHandling = createErrorHandling({
    generateCorrelationId: () => 'test-correlation-id',
    logError: () => undefined,
  })
  instance.use(errorHandling.correlationId)
  instance.get('/users/search', searchStudent)
  instance.use(errorHandling.handler)
  return instance
}

function students(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    _id: `user-${index}`,
    email: `student${index}@example.test`,
    name: `Student ${index}`,
  }))
}

beforeEach(() => {
  mockUserFind.mockReset()
  mockUserProductFind.mockReset()
  mockUserProductFind.mockReturnValue(chain([]))
})

describe('input validation', () => {
  test('rejects a term longer than the bound with its own message', async () => {
    const response = await request(app())
      .get(`/users/search?name=${'a'.repeat(MAX_CRITERION_LENGTH + 1)}&${LOOPBACK}`)
      .expect(400)

    expect(response.body).toEqual({ message: 'Termo de pesquisa demasiado longo.' })
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('accepts a term exactly at the bound', async () => {
    mockUserFind.mockReturnValue(chain([]))

    await request(app())
      .get(`/users/search?name=${'a'.repeat(MAX_CRITERION_LENGTH)}&${LOOPBACK}`)
      .expect(404)

    expect(mockUserFind).toHaveBeenCalledTimes(1)
  })

  test('applies the bound to every criterion, not just the free-text ones', async () => {
    const long = 'a'.repeat(MAX_CRITERION_LENGTH + 1)

    for (const key of ['email', 'name', 'discordId', 'hotmartUserId', 'curseducaUserId']) {
      const response = await request(app())
        .get(`/users/search?${key}=${long}&${LOOPBACK}`)
        .expect(400)

      expect(response.body.message).toBe('Termo de pesquisa demasiado longo.')
    }

    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('rejects a criterion supplied as an array instead of a string', async () => {
    const response = await request(app())
      .get(`/users/search?email=a@b.test&email=c@d.test&${LOOPBACK}`)
      .expect(400)

    expect(response.body.message).toContain('Pelo menos um critério de pesquisa é necessário')
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('rejects an object-shaped criterion used to smuggle an operator', async () => {
    const response = await request(app())
      .get(`/users/search?${encodeURIComponent('email[$ne]')}=x&${LOOPBACK}`)
      .expect(400)

    expect(response.body.message).toContain('Pelo menos um critério de pesquisa é necessário')
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('rejects a criterion that is empty once trimmed', async () => {
    const response = await request(app())
      .get(`/users/search?name=${encodeURIComponent('   ')}&${LOOPBACK}`)
      .expect(400)

    expect(response.body.message).toContain('Pelo menos um critério de pesquisa é necessário')
    expect(mockUserFind).not.toHaveBeenCalled()
  })

  test('trims a usable term before it becomes a filter', async () => {
    mockUserFind.mockReturnValue(chain([]))

    await request(app())
      .get(`/users/search?name=${encodeURIComponent('  Ana  ')}&${LOOPBACK}`)
      .expect(404)

    expect(mockUserFind.mock.calls[0][0].name.$regex.source).toBe('Ana')
  })
})

describe('literal matching', () => {
  async function patternFor(term: string): Promise<RegExp> {
    mockUserFind.mockReturnValue(chain([]))
    await request(app())
      .get(`/users/search?email=${encodeURIComponent(term)}&${LOOPBACK}`)
      .expect(404)
    return mockUserFind.mock.calls[0][0].email.$regex
  }

  test('treats a dot as a literal dot', async () => {
    const pattern = await patternFor('a.b@x.com')

    expect(pattern.test('a.b@x.com')).toBe(true)
    expect(pattern.test('aXb@x.com')).toBe(false)
  })

  test('finds an address containing a plus sign', async () => {
    const pattern = await patternFor('user+tag@x.com')

    expect(pattern.test('user+tag@x.com')).toBe(true)
    expect(pattern.test('userrrtag@x.com')).toBe(false)
  })

  test.each(['[', '(', '*', '?', '^', '$', '{', '|', '\\'])(
    'accepts %s as an ordinary character instead of failing',
    async (term) => {
      const pattern = await patternFor(term)
      expect(pattern.test(`x${term}y`)).toBe(true)
    },
  )

  test('a bare bracket is now a 404, not a server error', async () => {
    mockUserFind.mockReturnValue(chain([]))

    const response = await request(app())
      .get(`/users/search?email=${encodeURIComponent('[')}&${LOOPBACK}`)
      .expect(404)

    expect(response.body).toEqual({
      message: 'Nenhum aluno encontrado com os critérios fornecidos.',
    })
    expect(mockUserFind).toHaveBeenCalledTimes(1)
  })

  test('a catastrophic backtracking pattern is matched literally', async () => {
    const pattern = await patternFor('(a+)+$')

    expect(pattern.source).toBe('\\(a\\+\\)\\+\\$')
    expect(pattern.test('a'.repeat(200))).toBe(false)
  })
})

describe('stable ordering', () => {
  test('orders by _id so the capped window is deterministic', async () => {
    const query = chain(students(5))
    mockUserFind.mockReturnValue(query)

    await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(query.sort).toHaveBeenCalledWith({ _id: 1 })
  })

  test('sorts before limiting, so the cap takes the first rows of a total order', async () => {
    const query = chain(students(5))
    mockUserFind.mockReturnValue(query)

    await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(query.calls.indexOf('sort')).toBeGreaterThan(-1)
    expect(query.calls.indexOf('sort')).toBeLessThan(query.calls.indexOf('limit'))
  })
})

describe('result cap', () => {
  test('reads one row past the cap and never counts separately', async () => {
    const query = chain(students(10))
    mockUserFind.mockReturnValue(query)

    await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(query.limit).toHaveBeenCalledWith(SEARCH_FETCH_LIMIT)
    expect(SEARCH_FETCH_LIMIT).toBe(MAX_SEARCH_RESULTS + 1)
  })

  test('returns every row untruncated while under the cap', async () => {
    mockUserFind.mockReturnValue(chain(students(MAX_SEARCH_RESULTS)))

    const response = await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(response.body.data).toHaveLength(MAX_SEARCH_RESULTS)
    expect(response.body.meta.truncated).toBe(false)
    expect(response.body.meta.message).toBe(`Encontrados ${MAX_SEARCH_RESULTS} alunos`)
  })

  test('caps the payload and says so when the extra row exists', async () => {
    mockUserFind.mockReturnValue(chain(students(SEARCH_FETCH_LIMIT)))

    const response = await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    expect(response.body.data).toHaveLength(MAX_SEARCH_RESULTS)
    expect(response.body.meta.truncated).toBe(true)
    expect(response.body.meta.message).toBe(
      `Mais de ${MAX_SEARCH_RESULTS} alunos encontrados; refine a pesquisa`,
    )
    expect(response.body.meta.message).not.toContain(`Encontrados ${MAX_SEARCH_RESULTS}`)
  })

  test('enriches only the students that are actually returned', async () => {
    mockUserFind.mockReturnValue(chain(students(SEARCH_FETCH_LIMIT)))

    await request(app())
      .get(`/users/search?name=Student&${LOOPBACK}`)
      .expect(200)

    const ids = mockUserProductFind.mock.calls[0][0].userId.$in
    expect(ids).toHaveLength(MAX_SEARCH_RESULTS)
    expect(ids).not.toContain(`user-${MAX_SEARCH_RESULTS}`)
  })
})

describe('failure disclosure', () => {
  test('keeps internal detail out of the 500 body', async () => {
    mockUserFind.mockImplementation(() => {
      throw new Error('mongo exploded at 10.0.0.5:27017')
    })

    const response = await request(app())
      .get(`/users/search?email=a@b.test&${LOOPBACK}`)
      .expect(500)

    expect(response.body).toEqual({
      success: false,
      code: 'STUDENT_SEARCH_FAILED',
      message: 'Erro ao buscar aluno.',
      correlationId: 'test-correlation-id',
    })
    const serialized = JSON.stringify(response.body)
    expect(serialized).not.toContain('mongo exploded')
    expect(serialized).not.toContain('10.0.0.5')
  })
})
