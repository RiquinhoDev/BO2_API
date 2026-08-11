import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const source = (relativePath: string): string => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test('the winning inline health response stays byte-for-byte unchanged', () => {
  const routesIndex = source('src/routes/index.ts').replace(/\r\n/g, '\n')
  const start = routesIndex.indexOf('router.get("/health"')
  const end = routesIndex.indexOf('router.get("/info"', start)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)

  const declaration = routesIndex.slice(start, end).trim()
  expect(createHash('sha256').update(declaration).digest('hex')).toBe(
    '940ab3d7cfb1f7be5c0698e1330704515ed123e82acfbe4b4198b0f2c1c362cd',
  )
})

test('health topology and catalog point only at the winning index route', () => {
  const routesIndex = source('src/routes/index.ts')
  const runtimeRegistration = source('src/runtime/registerRoutes.ts')
  const catalog = JSON.parse(source('src/security/route-catalog.json')) as Array<{
    method: string
    path: string
    evidence: string
  }>
  const healthEntries = catalog.filter(({ method, path: routePath }) => (
    method === 'GET' && routePath === '/api/health'
  ))

  expect(routesIndex).toMatch(/router\.get\(["']\/health["']/)
  expect(runtimeRegistration).toContain("app.use('/api', router)")
  expect(runtimeRegistration).not.toMatch(/healthRoutes|health\.routes/)
  expect(fs.existsSync(path.join(process.cwd(), 'src/routes/health.routes.ts'))).toBe(false)
  expect(fs.existsSync(path.join(process.cwd(), 'src/controllers/health.controller.ts'))).toBe(false)
  expect(healthEntries).toHaveLength(1)
  expect(healthEntries[0].evidence).toMatch(/rota em src\/routes\/index\.ts:\d+$/)
})
