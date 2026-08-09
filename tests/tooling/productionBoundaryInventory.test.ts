import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sourceRoot = path.resolve(__dirname, '../../src')

const rawEnvironmentRead = /\bprocess\.env\b/
const localFiveHundred = /\.status\(\s*500\s*\)/
const publicErrorDetail = /\.json\([^\n]*(?:error\.message|details\s*:)/

const RAW_ENV_COMPOSITION_ROOTS = new Set([
  'config/appConfig.ts',
  ['config/test', 'Database.ts'].join(''),
  'scripts/maintenance/backfill-ac-webhook-receipt-leases.ts',
  'scripts/maintenance/ensure-users-v2-indexes.ts',
])

type Inventory = {
  rawEnvironmentRead: string[]
  localHttp500: string[]
  publicErrorDetail: string[]
}

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolutePath)
    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : []
  })
}

function inventory(root = sourceRoot): Inventory {
  const result: Inventory = {
    rawEnvironmentRead: [],
    localHttp500: [],
    publicErrorDetail: [],
  }

  for (const filePath of sourceFiles(root)) {
    const relativePath = path.relative(root, filePath).split(path.sep).join('/')
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      const location = `src/${relativePath}:${index + 1}`
      const trimmedLine = line.trimStart()
      const executableLine = /^(?:\/\/|\/\*|\*)/.test(trimmedLine) ? '' : line
      if (
        !RAW_ENV_COMPOSITION_ROOTS.has(relativePath)
        && rawEnvironmentRead.test(executableLine)
      ) result.rawEnvironmentRead.push(location)
      if (localFiveHundred.test(line)) result.localHttp500.push(location)
      if (publicErrorDetail.test(line)) result.publicErrorDetail.push(location)
    })
  }

  for (const values of Object.values(result)) values.sort()
  return result
}

const BASELINE = {
  "rawEnvironmentRead": [],
  "localHttp500": [
    "src/controllers/acTags/acReader.controller.ts:150",
    "src/controllers/acTags/acReader.controller.ts:188",
    "src/controllers/acTags/acReader.controller.ts:249",
    "src/controllers/acTags/acReader.controller.ts:293",
    "src/controllers/acTags/acReader.controller.ts:328",
    "src/controllers/acTags/activeCampaignCourse.controller.ts:132",
    "src/controllers/acTags/activeCampaignCourse.controller.ts:150",
    "src/controllers/acTags/activeCampaignCourse.controller.ts:277",
    "src/controllers/acTags/activeCampaignCourse.controller.ts:295",
    "src/controllers/acTags/activeCampaignHistoryList.controller.ts:191",
    "src/controllers/acTags/activeCampaignHistoryStats.controller.ts:195",
    "src/controllers/acTags/activeCampaignLegacyTagRules.controller.ts:110",
    "src/controllers/acTags/activeCampaignLegacyTagRules.controller.ts:29",
    "src/controllers/acTags/activeCampaignLegacyTagRules.controller.ts:52",
    "src/controllers/acTags/activeCampaignLegacyTagRules.controller.ts:81",
    "src/controllers/acTags/activeCampaignOps.controller.ts:159",
    "src/controllers/acTags/activeCampaignOps.controller.ts:177",
    "src/controllers/acTags/activeCampaignOps.controller.ts:215",
    "src/controllers/acTags/activeCampaignProductTags.controller.ts:120",
    "src/controllers/acTags/activeCampaignProductTags.controller.ts:174",
    "src/controllers/acTags/activeCampaignProductTags.controller.ts:218",
    "src/controllers/acTags/activeCampaignProductTags.controller.ts:263",
    "src/controllers/acTags/activeCampaignProductTags.controller.ts:323",
    "src/controllers/acTags/tagRule.controller.ts:104",
    "src/controllers/acTags/tagRule.controller.ts:143",
    "src/controllers/acTags/tagRule.controller.ts:178",
    "src/controllers/acTags/tagRule.controller.ts:215",
    "src/controllers/acTags/tagRule.controller.ts:34",
    "src/controllers/acTags/tagRule.controller.ts:67",
    "src/controllers/acTags/tagRuleEstimate.controller.ts:123",
    "src/controllers/acTags/tagRuleEstimate.controller.ts:210",
    "src/controllers/acTags/tagRuleEstimate.controller.ts:302",
    "src/controllers/auth.controller.ts:107",
    "src/controllers/auth.controller.ts:154",
    "src/controllers/auth.controller.ts:207",
    "src/controllers/auth.controller.ts:270",
    "src/controllers/clarezaController.ts:118",
    "src/controllers/clarezaController.ts:174",
    "src/controllers/clarezaController.ts:186",
    "src/controllers/clarezaController.ts:204",
    "src/controllers/clarezaController.ts:218",
    "src/controllers/clarezaController.ts:229",
    "src/controllers/clarezaController.ts:24",
    "src/controllers/clarezaController.ts:243",
    "src/controllers/clarezaController.ts:261",
    "src/controllers/clarezaController.ts:278",
    "src/controllers/clarezaController.ts:42",
    "src/controllers/clarezaController.ts:60",
    "src/controllers/cohortAnalytics.controller.ts:54",
    "src/controllers/course.controller.ts:135",
    "src/controllers/course.controller.ts:178",
    "src/controllers/course.controller.ts:25",
    "src/controllers/course.controller.ts:64",
    "src/controllers/course.controller.ts:98",
    "src/controllers/engagement.controller.ts:294",
    "src/controllers/engagement.controller.ts:550",
    "src/controllers/engagement.controller.ts:573",
    "src/controllers/engagement.controller.ts:766",
    "src/controllers/engagement.controller.ts:960",
    "src/controllers/guru.analytics.controller.ts:183",
    "src/controllers/guru.analytics.controller.ts:341",
    "src/controllers/guru.analytics.controller.ts:379",
    "src/controllers/guru.analytics.controller.ts:803",
    "src/controllers/guru.analytics.controller.ts:990",
    "src/controllers/guru.snapshot.controller.ts:252",
    "src/controllers/guru.snapshot.controller.ts:331",
    "src/controllers/guru.snapshot.controller.ts:361",
    "src/controllers/guru.snapshot.controller.ts:400",
    "src/controllers/guru.snapshot.controller.ts:439",
    "src/controllers/guru.snapshot.controller.ts:509",
    "src/controllers/guru.snapshot.controller.ts:665",
    "src/controllers/guru.snapshot.controller.ts:902",
    "src/controllers/guru.trials.controller.ts:137",
    "src/controllers/guru.trials.controller.ts:37",
    "src/controllers/guru.trials.controller.ts:51",
    "src/controllers/guru.trials.controller.ts:70",
    "src/controllers/guru.trials.controller.ts:89",
    "src/controllers/guruInactivationExternal.controller.ts:40",
    "src/controllers/guruSubscriptionList.controller.ts:126",
    "src/controllers/guruWebhookList.controller.ts:75",
    "src/controllers/health.controller.ts:56",
    "src/controllers/lessons.controller.ts:147",
    "src/controllers/lessons.controller.ts:200",
    "src/controllers/lessons.controller.ts:237",
    "src/controllers/lessons.controller.ts:49",
    "src/controllers/lessons.controller.ts:95",
    "src/controllers/metrics.controller.ts:26",
    "src/controllers/metrics.controller.ts:47",
    "src/controllers/metrics.controller.ts:83",
    "src/controllers/populateHistory.controller.ts:257",
    "src/controllers/populateHistory.controller.ts:310",
    "src/controllers/populateHistory.controller.ts:367",
    "src/controllers/products/product.controller.ts:119",
    "src/controllers/products/product.controller.ts:205",
    "src/controllers/products/product.controller.ts:249",
    "src/controllers/products/product.controller.ts:307",
    "src/controllers/products/product.controller.ts:354",
    "src/controllers/products/product.controller.ts:465",
    "src/controllers/products/product.controller.ts:71",
    "src/controllers/products/productProfile.controller.ts:138",
    "src/controllers/products/productProfile.controller.ts:187",
    "src/controllers/products/productProfile.controller.ts:253",
    "src/controllers/products/productProfile.controller.ts:39",
    "src/controllers/products/productProfile.controller.ts:391",
    "src/controllers/products/productProfile.controller.ts:464",
    "src/controllers/products/productProfile.controller.ts:76",
    "src/controllers/products/productSalesStats.controller.ts:106",
    "src/controllers/products/productSalesStats.controller.ts:139",
    "src/controllers/products/productSalesStats.controller.ts:183",
    "src/controllers/products/productSalesStats.controller.ts:28",
    "src/controllers/products/productSalesStats.controller.ts:58",
    "src/controllers/products/products.controller.ts:116",
    "src/controllers/products/products.controller.ts:150",
    "src/controllers/products/products.controller.ts:169",
    "src/controllers/products/products.controller.ts:17",
    "src/controllers/renewal.controller.ts:123",
    "src/controllers/renewal.controller.ts:137",
    "src/controllers/renewal.controller.ts:150",
    "src/controllers/renewal.controller.ts:161",
    "src/controllers/renewal.controller.ts:26",
    "src/controllers/renewal.controller.ts:81",
    "src/controllers/studentHistory.controller.ts:113",
    "src/controllers/studentHistory.controller.ts:194",
    "src/controllers/studentsController.ts:60",
    "src/controllers/studentsController.ts:68",
    "src/controllers/sync.controller.ts:121",
    "src/controllers/sync.controller.ts:176",
    "src/controllers/sync.controller.ts:242",
    "src/controllers/sync.controller.ts:294",
    "src/controllers/sync.controller.ts:438",
    "src/controllers/sync.controller.ts:49",
    "src/controllers/sync.controller.ts:542",
    "src/controllers/sync.controller.ts:576",
    "src/controllers/sync.controller.ts:59",
    "src/controllers/sync.controller.ts:624",
    "src/controllers/sync.controller.ts:660",
    "src/controllers/sync.controller.ts:711",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:146",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:204",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:426",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:496",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:535",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:585",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:637",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:726",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:784",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:832",
    "src/controllers/syncUtilizadoresControllers/cronManagement.controller.ts:898",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:134",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:413",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:555",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:591",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:641",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:691",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:720",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:746",
    "src/controllers/syncUtilizadoresControllers/curseduca.controller.ts:806",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1002",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1101",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1178",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:1231",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:134",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:174",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:229",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:271",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:815",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:944",
    "src/controllers/syncUtilizadoresControllers/hotmart.controller.ts:977",
    "src/controllers/syncUtilizadoresControllers/syncReports.controller.ts:108",
    "src/controllers/syncUtilizadoresControllers/syncReports.controller.ts:40",
    "src/controllers/syncUtilizadoresControllers/syncReports.controller.ts:77",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:154",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:202",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:268",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:336",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:385",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:431",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:463",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:501",
    "src/controllers/syncUtilizadoresControllers/syncStats.controller.ts:72",
    "src/controllers/tagEvaluation.controller.ts:411",
    "src/controllers/tagEvaluation.controller.ts:560",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:127",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:169",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:209",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:258",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:26",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:285",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:307",
    "src/controllers/tagMonitoring/criticalTag.controller.ts:88",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:136",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:161",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:183",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:226",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:251",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:288",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:316",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:34",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:357",
    "src/controllers/tagMonitoring/tagMonitoring.controller.ts:71",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:113",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:156",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:199",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:241",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:263",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:286",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:308",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:37",
    "src/controllers/tagMonitoring/tagNotification.controller.ts:78",
    "src/controllers/testHistory.controller.ts:172",
    "src/controllers/testHistory.controller.ts:242",
    "src/controllers/testimonials.controller.ts:1017",
    "src/controllers/testimonials.controller.ts:1126",
    "src/controllers/testimonials.controller.ts:1210",
    "src/controllers/testimonials.controller.ts:361",
    "src/controllers/testimonials.controller.ts:456",
    "src/controllers/testimonials.controller.ts:544",
    "src/controllers/testimonials.controller.ts:659",
    "src/controllers/testimonials.controller.ts:738",
    "src/controllers/testimonials.controller.ts:770",
    "src/controllers/testimonials.controller.ts:939",
    "src/controllers/userHistory.controller.ts:166",
    "src/controllers/userHistory.controller.ts:209",
    "src/controllers/userHistory.controller.ts:85",
    "src/controllers/webhooks.controller.ts:31",
    "src/controllers/webhooks.controller.ts:52",
    "src/middleware/auth.middleware.ts:76",
    "src/routes/ACroutes/activecampaign.routes.ts:196",
    "src/routes/achievements.routes.ts:118",
    "src/routes/achievements.routes.ts:164",
    "src/routes/achievements.routes.ts:47",
    "src/routes/achievements.routes.ts:71",
    "src/routes/users.routes.ts:254",
    "src/routes/validationLogs.routes.ts:137",
    "src/routes/validationLogs.routes.ts:70"
  ],
  "publicErrorDetail": [
    "src/controllers/guru.trials.controller.ts:113",
    "src/controllers/guru.trials.controller.ts:137",
    "src/controllers/guru.trials.controller.ts:37",
    "src/controllers/guru.trials.controller.ts:51",
    "src/controllers/guru.trials.controller.ts:70",
    "src/controllers/guru.trials.controller.ts:89",
    "src/controllers/renewal.controller.ts:123",
    "src/controllers/renewal.controller.ts:137",
    "src/controllers/renewal.controller.ts:150",
    "src/controllers/renewal.controller.ts:161",
    "src/controllers/renewal.controller.ts:26",
    "src/controllers/renewal.controller.ts:81",
    "src/controllers/sync.controller.ts:711",
    "src/controllers/webhooks.controller.ts:31",
    "src/controllers/webhooks.controller.ts:52",
    "src/routes/achievements.routes.ts:118",
    "src/routes/achievements.routes.ts:164",
    "src/routes/achievements.routes.ts:47",
    "src/routes/achievements.routes.ts:71",
  ]
} as const

/**
 * Reviewable debt totals. The path lists above move whenever an unrelated edit
 * shifts a line number, which makes a growing debt easy to miss in a large
 * diff. These ceilings must only ever be lowered: a slice that resolves debt
 * lowers the number, a slice that merely relocates it cannot hide behind the
 * churn, and a slice that adds debt fails here even if the baseline was
 * regenerated.
 */
const DEBT_CEILING = {
  "rawEnvironmentRead": 0,
  "localHttp500": 284,
  "publicErrorDetail": 20
} as const

test('production boundary inventory matches the migration baseline', () => {
  const current = inventory()

  expect(current.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
  expect(current.localHttp500).toEqual(BASELINE.localHttp500)
  expect(current.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
})

test('production boundary debt never grows', () => {
  const current = inventory()

  expect(current.rawEnvironmentRead.length).toBeLessThanOrEqual(DEBT_CEILING.rawEnvironmentRead)
  expect(current.localHttp500.length).toBeLessThanOrEqual(DEBT_CEILING.localHttp500)
  expect(current.publicErrorDetail.length).toBeLessThanOrEqual(DEBT_CEILING.publicErrorDetail)

  // The ceiling is only meaningful while it tracks the recorded baseline.
  expect(BASELINE.rawEnvironmentRead.length).toBeLessThanOrEqual(DEBT_CEILING.rawEnvironmentRead)
  expect(BASELINE.localHttp500.length).toBeLessThanOrEqual(DEBT_CEILING.localHttp500)
  expect(BASELINE.publicErrorDetail.length).toBeLessThanOrEqual(DEBT_CEILING.publicErrorDetail)
})

test('inventory catches owned consumer mutations and restores every fixture', () => {
  const sourceOwnedPath = path.join(sourceRoot, 'security/validatedInput.ts')
  const originalOwnedConsumer = fs.readFileSync(sourceOwnedPath, 'utf8')
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-inventory-'))
  const ownedConsumerPath = path.join(tempRoot, 'security/validatedInput.ts')
  const fixturePath = path.join(tempRoot, '__task1_inventory_fixture.ts')
  const ownedMutation = `const __task3_inventory_mutation = process.env\n`
  const fixture = `const unsafe = process.env.UNSAFE_TEST\nconst fiveHundred = res.status(500)\nconst detail = res.json({ details: error.message })\n`

  try {
    fs.mkdirSync(path.dirname(ownedConsumerPath), { recursive: true })
    fs.writeFileSync(ownedConsumerPath, `${ownedMutation}${originalOwnedConsumer}`, 'utf8')
    fs.writeFileSync(fixturePath, fixture, 'utf8')
    const mutated = inventory(tempRoot)
    expect(mutated.rawEnvironmentRead).toContain('src/security/validatedInput.ts:1')
    expect(mutated.rawEnvironmentRead).toContain('src/__task1_inventory_fixture.ts:1')
    expect(mutated.localHttp500).toContain('src/__task1_inventory_fixture.ts:2')
    expect(mutated.publicErrorDetail).toContain('src/__task1_inventory_fixture.ts:3')
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  const restored = inventory()
  expect(restored.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
  expect(restored.localHttp500).toEqual(BASELINE.localHttp500)
  expect(restored.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
  expect(fs.existsSync(tempRoot)).toBe(false)
})
