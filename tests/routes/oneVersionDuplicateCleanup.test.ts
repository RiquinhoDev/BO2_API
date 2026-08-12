import fs from 'node:fs'
import path from 'node:path'

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8')

test('exposes only canonical ActiveCampaign, cron and Hotmart route identities', () => {
  const activeCampaign = read('src/routes/ACroutes/activecampaign.routes.ts')
  const runtime = read('src/runtime/registerRoutes.ts')
  const cron = read('src/routes/cron/createCronManagementRouter.ts')
  const hotmart = read('src/routes/hotmart.routes.ts')

  expect(activeCampaign).not.toContain("router.get('/debug/curseduca-data'")
  expect(activeCampaign).not.toContain("router.post('/courses/clareza/evaluate'")
  expect(activeCampaign).not.toContain("router.post('/courses/ogi/evaluate'")
  expect(activeCampaign).not.toContain("router.get('/tag-rules'")
  expect(activeCampaign).not.toContain("router.post('/tag-rules'")
  expect(activeCampaign).not.toContain("router.put('/tag-rules/:id'")
  expect(activeCampaign).not.toContain("router.delete('/tag-rules/:id'")
  expect(runtime).not.toContain("app.use('/cron-tags'")
  expect(runtime).not.toContain("app.get('/api/tag-rules'")
  expect(cron).not.toContain("'/execute-legacy'")
  expect(cron).not.toContain("'/execute'")
  expect(hotmart).not.toContain("'/syncHotmartUsers'")
  expect(hotmart).toContain("router.get('/sync/universal'")
})

test('products list has one canonical response and no legacy selector', () => {
  const controller = read('src/controllers/products/product.controller.ts')
  expect(controller).not.toContain('getLegacyStats')
  expect(controller).not.toContain("legacy === 'true'")
  expect(controller).not.toContain('_legacy')
  expect(controller).not.toContain('_v2')
  const routes = read('src/routes/products.routes.ts')
  expect(routes).not.toContain('legacy=true')
  expect(routes).not.toContain('getLegacyProducts')
  expect(routes).not.toContain('getLegacyProductById')
  expect(controller).toContain('successResponse({ products: productsWithCounts }, { total: products.length })')
})


test('production route sources contain no executable 501 response', () => {
  const controllers = read('src/controllers/syncUtilizadoresControllers/curseduca/legacy.controller.ts')
  expect(controllers).not.toContain('status(501)')
})
