import fs from 'fs'
import path from 'path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test('operational response wave uses canonical success envelopes only for the four safe identities', () => {
  const tags = read('src/controllers/tagEvaluation.controller.ts')
  const userImport = read('src/controllers/userDiscordImport.controller.ts')
  const dashboard = read('src/controllers/syncUtilizadoresControllers/curseduca/dashboard.controller.ts')
  const routes = read('src/routes/index.ts')
  const repair = read('src/controllers/guruAnalytics/subscriptionRepair.controller.ts')
  expect(tags).toContain("import { successResponse } from '../contracts/responseContract'")
  expect(tags.match(/successResponse\(/g)).toHaveLength(2)
  expect(tags).toContain('const payload = data.data ?? data')
  expect(userImport).toContain("import { successResponse } from '../contracts/responseContract'")
  expect(userImport).toContain("res.json(successResponse({ syncId: result.syncId, stats: result.stats }, {")
  expect(dashboard).toContain("import { successResponse } from '../../../contracts/responseContract'")
  expect(dashboard).toContain('res.status(200).json(successResponse(stats, {')
  expect(routes).toContain('router.get("/health"')
  expect(repair).toContain('return res.json({')
})
