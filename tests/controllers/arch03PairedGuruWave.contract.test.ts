import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) => fs.readFileSync(path.resolve(relativePath), 'utf8')

const selected: Array<[string, number]> = [
  ['src/controllers/guruSnapshots/crud.controller.ts', 7],
  ['src/controllers/guruSnapshots/history.controller.ts', 1],
  ['src/controllers/guruSnapshots/analytics.controller.ts', 2],
  ['src/controllers/guruAnalytics/churn.controller.ts', 5],
  ['src/controllers/guruAnalytics/comparison.controller.ts', 1],
  ['src/controllers/guruSubscriptionList.controller.ts', 1],
  ['src/controllers/guru.sso.controller.ts', 3],
  ['src/controllers/guru.trials.controller.ts', 6],
]

test.each(selected)('%s canonicalizes every selected success exit', (file, count) => {
  const source = read(file)
  expect(source).toContain("import { successResponse } from")
  expect(source.match(/successResponse\(/g)).toHaveLength(count)
})

test('excluded Guru identities keep their reviewed behavior', () => {
  expect(read('src/controllers/guru.webhook.controller.ts'))
    .toMatch(/handleGuruWebhook[\s\S]*success: true/)
  expect(read('src/controllers/guruWebhookAdmin.controller.ts'))
    .not.toContain('guruTokenDebugStatus')
  expect(read('src/controllers/guru.sso.controller.ts')).toContain('return res.redirect(302, ssoUrl)')
})
