import {
  matchCatalogRoute,
  matchCatalogRouteFrom,
  type CatalogRouteEntry,
} from '../../src/security/routeCatalogMatcher'

describe('route catalog matcher', () => {
  test('matches a parameterized canonical route from the production catalog', () => {
    expect(matchCatalogRoute('GET', '/api/users/507f1f77bcf86cd799439011')).toMatchObject({
      method: 'GET',
      path: '/api/users/:id',
      access: 'authenticated',
    })
  })

  test('normalizes method case, query strings, and one trailing slash', () => {
    expect(
      matchCatalogRoute('get', '/api/users/507f1f77bcf86cd799439011/?tab=history'),
    ).toMatchObject({
      method: 'GET',
      path: '/api/users/:id',
    })
  })

  test('returns null for an unknown route so normal 404 handling remains available', () => {
    expect(matchCatalogRoute('GET', '/api/does-not-exist')).toBeNull()
  })

  test('rejects ambiguous catalog templates instead of selecting one arbitrarily', () => {
    const ambiguous: readonly CatalogRouteEntry[] = [
      {
        method: 'GET',
        path: '/api/items/:id',
        access: 'authenticated',
        writes: false,
        destructive: false,
      },
      {
        method: 'GET',
        path: '/api/items/:slug',
        access: 'authenticated',
        writes: false,
        destructive: false,
      },
    ]

    expect(() => matchCatalogRouteFrom(ambiguous, 'GET', '/api/items/value')).toThrow(
      /ambiguous route catalog match/i,
    )
  })

  test('prefers an exact static route over a parameterized sibling', () => {
    const routes: readonly CatalogRouteEntry[] = [
      {
        method: 'GET',
        path: '/api/items/:id',
        access: 'authenticated',
        writes: false,
        destructive: false,
      },
      {
        method: 'GET',
        path: '/api/items/period',
        access: 'authenticated',
        writes: false,
        destructive: false,
      },
    ]

    expect(matchCatalogRouteFrom(routes, 'GET', '/api/items/period')).toMatchObject({
      path: '/api/items/period',
    })
  })

  test('does not match a different HTTP method', () => {
    const routes: readonly CatalogRouteEntry[] = [
      {
        method: 'POST',
        path: '/api/items/:id',
        access: 'authenticated',
        writes: true,
        destructive: false,
      },
    ]

    expect(matchCatalogRouteFrom(routes, 'GET', '/api/items/value')).toBeNull()
  })
})
