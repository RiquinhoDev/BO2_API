import fs from 'node:fs'
import path from 'node:path'

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8')

const routeSources = {
  curseduca: read('src/routes/curseduca.routes.ts'),
  hotmart: read('src/routes/hotmart.routes.ts'),
  activeCampaign: read('src/routes/ACroutes/activecampaign.routes.ts'),
  users: read('src/routes/users.routes.ts'),
  dashboard: read('src/routes/dashboardRoutes.ts'),
}

describe('single-version HTTP route identities', () => {
  test('mounts CursEduca catalog reads directly without a nested version router', () => {
    expect(routeSources.curseduca).toContain("router.get('/catalog/stats', getCurseducaStats)")
    expect(routeSources.curseduca).toContain("router.get('/products', getCurseducaProducts)")
    expect(routeSources.curseduca).toContain("router.get('/products/:groupId', getCurseducaProductByGroupId)")
    expect(routeSources.curseduca).toContain("router.get('/products/:groupId/users', getCurseducaProductUsers)")
    expect(routeSources.curseduca).not.toContain("router.use('/v2'")
  })

  test('mounts Hotmart catalog reads without a version segment', () => {
    for (const route of [
      "router.get('/stats'",
      "router.get('/products'",
      "router.get('/products/:subdomain'",
      "router.get('/products/:subdomain/users'",
    ]) expect(routeSources.hotmart).toContain(route)
    expect(routeSources.hotmart).not.toContain("router.get('/v2/")
  })

  test('uses descriptive ActiveCampaign product-tag resources', () => {
    for (const route of [
      "router.post('/product-tags/apply'",
      "router.post('/product-tags/remove'",
      "router.get('/products/:productId/tagged'",
      "router.get('/product-tags/stats'",
      "router.post('/products/:productId/tags/sync'",
    ]) expect(routeSources.activeCampaign).toContain(route)
    expect(routeSources.activeCampaign).not.toContain("'/v2/")
  })

  test('uses collision-free Users resources and removes the v2 alias', () => {
    for (const route of [
      "'/enrollments'",
      "'/analytics'",
      "'/analytics/stats'",
      "'/engagement/comparison'",
      "'/engagement/heatmap'",
    ]) expect(routeSources.users).toContain(route)
    expect(routeSources.users).not.toContain("'/v2'")
    expect(routeSources.users).not.toContain("'/v2/")
  })

  test('gives the materialized dashboard one unversioned namespace', () => {
    expect(routeSources.dashboard).toContain("router.get('/materialized-stats', getDashboardStatsV3)")
    expect(routeSources.dashboard).toContain("router.post('/materialized-stats/rebuild'")
    expect(routeSources.dashboard).not.toContain("'/stats/v3")
  })
})