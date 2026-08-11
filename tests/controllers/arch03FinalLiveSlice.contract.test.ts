import fs from 'node:fs'

const source = (path: string) => fs.readFileSync(path, 'utf8')

test('canonicalizes the seven final live mutation success branches', () => {
  const renewal = source('src/controllers/renewal.controller.ts')
  expect(renewal).toContain('res.json(successResponse({ report }))')

  const discord = source('src/routes/discordRenewal.routes.ts')
  expect(discord).toContain('res.json(successResponse({ report }))')
  expect(discord).toContain('if (!result.success) return res.status(400).json(result)')
  expect(discord).toContain('res.json(successResponse({ result }))')

  const renewalAc = source('src/routes/renewalAc.routes.ts')
  expect(renewalAc).toContain('res.json(successResponse({ report }))')
  expect(renewalAc).toContain('if (!result.success) return res.status(400).json(result)')
  expect(renewalAc).toContain('res.json(successResponse({}, { message: result.message }))')

  const lessons = source('src/controllers/courseLessons.controller.ts')
  expect(lessons).toContain('res.json(successResponse({ sync: result },')

  const sales = source('src/controllers/products/productSalesStats.controller.ts')
  const response = sales.indexOf("res.json(successResponse({ estimatedTime: '30-60 segundos' },")
  const background = sales.indexOf('buildProductSalesStats()')
  expect(response).toBeGreaterThan(-1)
  expect(background).toBeGreaterThan(response)
})

test('keeps semantic stop and external routes outside the slice', () => {
  const discord = source('src/routes/discordRenewal.routes.ts')
  expect(discord).toContain("router.post('/plan'")
  expect(discord).toContain("router.post('/messages/send'")
  const renewalAc = source('src/routes/renewalAc.routes.ts')
  expect(renewalAc).toContain("router.post('/plan'")
})