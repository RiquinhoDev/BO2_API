import routeCatalog from './route-catalog.json'

export type CatalogAccess = 'public' | 'authenticated' | 'signature' | 'dead'

export interface CatalogRouteEntry {
  method: string
  path: string
  access: CatalogAccess
  writes: boolean
  destructive: boolean
}

export type CatalogRouteMatch = CatalogRouteEntry

function parseCatalogAccess(value: string): CatalogAccess {
  switch (value) {
    case 'public':
    case 'authenticated':
    case 'signature':
    case 'dead':
      return value
    default:
      throw new Error(`Unsupported route catalog access: ${value}`)
  }
}

const catalog: readonly CatalogRouteEntry[] = routeCatalog.map((route) => ({
  method: route.method,
  path: route.path,
  access: parseCatalogAccess(route.access),
  writes: route.writes,
  destructive: route.destructive,
}))

function normalizePath(value: string): string {
  const pathname = value.split(/[?#]/, 1)[0]
  if (!pathname) return '/'

  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (withLeadingSlash.length > 1 && withLeadingSlash.endsWith('/')) {
    return withLeadingSlash.slice(0, -1).toLowerCase()
  }

  return withLeadingSlash.toLowerCase()
}

function pathMatchesTemplate(template: string, pathname: string): boolean {
  const expected = normalizePath(template).split('/').filter(Boolean)
  const actual = normalizePath(pathname).split('/').filter(Boolean)

  if (expected.length !== actual.length) return false

  return expected.every((segment, index) => (
    segment.startsWith(':') || segment === actual[index]
  ))
}

export function matchCatalogRouteFrom(
  routes: readonly CatalogRouteEntry[],
  method: string,
  pathname: string,
): CatalogRouteMatch | null {
  const normalizedMethod = method.toUpperCase()
  const matches = routes.filter((route) => (
    route.method.toUpperCase() === normalizedMethod
    && pathMatchesTemplate(route.path, pathname)
  ))

  if (matches.length === 0) return null
  if (matches.length > 1) {
    throw new Error(`Ambiguous route catalog match for ${normalizedMethod} ${normalizePath(pathname)}`)
  }

  return matches[0]
}

export function matchCatalogRoute(
  method: string,
  pathname: string,
): CatalogRouteMatch | null {
  return matchCatalogRouteFrom(catalog, method, pathname)
}
