import { paginate } from '../../src/utils/pagination'

describe('paginate', () => {
  it('uses the default page and limit', () => {
    const pagination = paginate({})

    expect(pagination).toMatchObject({
      page: 1,
      limit: 50,
      skip: 0
    })
  })

  it('accepts positive integer query-string values', () => {
    const pagination = paginate({ page: '3', limit: '25' })

    expect(pagination).toMatchObject({
      page: 3,
      limit: 25,
      skip: 50
    })
  })

  it('uses defaults for invalid values', () => {
    const pagination = paginate(
      { page: 'invalid', limit: '2.5' },
      { defaultLimit: 40 }
    )
    const nonScalarValues = paginate({ page: {}, limit: null })

    expect(pagination).toMatchObject({
      page: 1,
      limit: 40,
      skip: 0
    })
    expect(nonScalarValues).toMatchObject({
      page: 1,
      limit: 50,
      skip: 0
    })
  })

  it('clamps values below the minimum', () => {
    const pagination = paginate({ page: -4, limit: 0 })

    expect(pagination).toMatchObject({
      page: 1,
      limit: 1,
      skip: 0
    })
  })

  it('honours a lower endpoint maximum', () => {
    const pagination = paginate(
      { page: 2, limit: 100 },
      { maxLimit: 75 }
    )

    expect(pagination).toMatchObject({
      page: 2,
      limit: 75,
      skip: 75
    })
  })

  it('never allows the maximum or default limit to exceed 200', () => {
    const requestedLimit = paginate(
      { limit: 10_000 },
      { maxLimit: 10_000 }
    )
    const oversizedDefault = paginate(
      { limit: 'invalid' },
      { defaultLimit: 10_000, maxLimit: 10_000 }
    )

    expect(requestedLimit.limit).toBe(200)
    expect(oversizedDefault.limit).toBe(200)
  })

  it('builds metadata from the normalized page and limit', () => {
    const pagination = paginate({ page: 3, limit: 20 })

    expect(pagination.metadata(101)).toEqual({
      page: 3,
      limit: 20,
      total: 101,
      pages: 6
    })
    expect(pagination.metadata(0)).toEqual({
      page: 3,
      limit: 20,
      total: 0,
      pages: 0
    })
  })
})
