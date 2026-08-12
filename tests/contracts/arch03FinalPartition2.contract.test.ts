import fs from 'node:fs'

const read = (path: string) => fs.readFileSync(path, 'utf8')

test('final sync owners emit canonical operational envelopes without public version markers', () => {
  const files = [
    'src/controllers/syncUtilizadoresControllers/curseduca/legacy.controller.ts',
    'src/controllers/syncUtilizadoresControllers/curseduca/sync.controller.ts',
    'src/controllers/hotmart/hotmartUniversalSync.controller.ts',
    'src/controllers/sync/operations.controller.ts',
  ]
  for (const file of files) {
    const source = read(file)
    expect(source).toContain('operationalSuccessResponse(')
    expect(source).not.toMatch(/_(?:version|universalSync)\s*:/)
  }
})

test('Guru reprocess is canonical while the external webhook acknowledgement remains unchanged', () => {
  const source = read('src/controllers/guru.webhook.controller.ts')
  expect(source).toContain('createGuruReprocessResponse')
  expect(source).toContain('target.json(successResponse(data))')
  expect(source.slice(source.indexOf('export const reprocessWebhook'))).toContain('createGuruReprocessResponse(res)')
  expect(source.slice(source.indexOf('export const handleGuruWebhook'), source.indexOf('export const listWebhooksGroupedByMonth'))).toMatch(/success: true/)
})
