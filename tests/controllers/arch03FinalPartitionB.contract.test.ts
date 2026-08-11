import fs from 'node:fs'
import path from 'node:path'
const source = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

test('canonicalizes the four safe sync history success branches without changing statuses or writes', () => {
  const text = source('src/controllers/sync/history.controller.ts')
  expect(text).toMatch(/res\.json\(successResponse\(\{\s*overview:/)
  expect(text).toContain('res.json(successResponse({ deletedCount: result.deletedCount, cutoffDate: cutoffDate.toISOString() },')
  expect(text).toContain('res.json(successResponse({ syncId, newStatus: "pending" },')
  expect(text).toContain('res.status(201).json(successResponse({ syncRecord },')
  expect(text).toContain('await SyncHistory.deleteMany(')
  expect(text).toContain('await SyncHistory.findByIdAndUpdate(syncId,')
  expect(text).toContain('await syncRecord.save()')
})

test('canonicalizes cron log reads and keeps the last-20 ordering', () => {
  const text = source('src/controllers/acTags/activeCampaignOps.controller.ts')
  expect(text).toContain('const logs = await CronExecutionLog.find().sort({ startedAt: -1 }).limit(20)')
  expect(text).toContain('res.json(successResponse({ logs }))')
})

test('canonicalizes only the successful Discord preview and preserves its 404 branch', () => {
  const text = source('src/routes/discordRenewal.routes.ts')
  expect(text).toContain('if (!result.success) return res.status(404).json(result)')
  expect(text).toContain('res.json(successResponse({ preview: result.preview, target: result.target }))')
})

test('leaves the Front-consumed product-sales rebuild outside this Back-only partition', () => {
  const text = source('src/controllers/products/productSalesStats.controller.ts')
  expect(text).toContain("message: 'Rebuild de Product Sales Stats iniciado em background'")
  expect(text).not.toContain('successResponse({ estimatedTime:')
})