import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')

test('final Partition 1 uses canonical envelopes only on successful branches', () => {
  const acReader = read('src/controllers/acTags/acReader.controller.ts')
  expect(acReader).toContain('successResponse(syncResult)')
  expect(acReader).toContain('successResponse(found, { summary:')
  expect(acReader).toContain('successResponse(results, { summary })')

  expect(read('src/controllers/acTags/activeCampaignProductTags.controller.ts')).toContain('successResponse(results, { productId, productName: product.name })')
  expect(read('src/controllers/acTags/activeCampaignOps.controller.ts')).toContain('successResponse({ executionId, results:')

  const clareza = read('src/controllers/clarezaController.ts')
  expect(clareza.match(/successResponse\(result\)/g)).toHaveLength(6)

  const classes = read('src/controllers/classes/hotmartClassSync.controller.ts')
  expect(classes).toContain('successResponse({ stats: result.stats, classIds: result.classIds }')
  expect(classes).toContain('successResponse({ stats: result.stats, errors: result.errors }')
  expect(classes).toContain('successResponse({ stats: result.stats, syncId: result.syncId }')

  const courses = read('src/controllers/acTags/activeCampaignCourse.controller.ts')
  expect(courses.match(/successResponse\(preview\)/g)).toHaveLength(2)

  expect(read('src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller.ts')).toContain('successResponse({')
  expect(read('src/routes/discordRenewal.routes.ts')).toContain('successResponse({ messageIds: result.messageIds }')
})