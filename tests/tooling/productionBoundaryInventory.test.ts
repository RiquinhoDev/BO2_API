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
    "src/controllers/engagement/details.controller.ts:188",
    "src/controllers/engagement/stats.controller.ts:190",
    "src/controllers/engagement/summary.controller.ts:184",
    "src/controllers/engagement/summary.controller.ts:209",
    "src/controllers/engagement/users.controller.ts:252",
    "src/controllers/guruAnalytics/churn.controller.ts:110",
    "src/controllers/guruAnalytics/churn.controller.ts:268",
    "src/controllers/guruAnalytics/churn.controller.ts:306",
    "src/controllers/guruAnalytics/comparison.controller.ts:423",
    "src/controllers/guruAnalytics/subscriptionRepair.controller.ts:188",
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
    "src/controllers/studentHistory.controller.ts:113",
    "src/controllers/studentHistory.controller.ts:194",
    "src/controllers/studentsController.ts:60",
    "src/controllers/studentsController.ts:68",
    "src/controllers/tagEvaluation.controller.ts:308",
    "src/controllers/tagEvaluation.controller.ts:457",
    "src/controllers/testHistory.controller.ts:172",
    "src/controllers/testHistory.controller.ts:242",
    "src/controllers/testimonials/testimonialCandidates.controller.ts:178",
    "src/controllers/testimonials/testimonialCandidates.controller.ts:288",
    "src/controllers/testimonials/testimonialCommands.controller.ts:102",
    "src/controllers/testimonials/testimonialCommands.controller.ts:217",
    "src/controllers/testimonials/testimonialCommands.controller.ts:296",
    "src/controllers/testimonials/testimonialCommands.controller.ts:328",
    "src/controllers/testimonials/testimonialQueries.controller.ts:184",
    "src/controllers/testimonials/testimonialQueries.controller.ts:262",
    "src/controllers/testimonials/testimonialQueries.controller.ts:324",
    "src/controllers/testimonials/testimonialQueries.controller.ts:89",
    "src/controllers/userHistory.controller.ts:166",
    "src/controllers/userHistory.controller.ts:209",
    "src/controllers/userHistory.controller.ts:85",
    "src/middleware/auth.middleware.ts:76",
    "src/routes/ACroutes/activecampaign.routes.ts:196",
    "src/routes/users.routes.ts:254",
    "src/routes/validationLogs.routes.ts:137",
    "src/routes/validationLogs.routes.ts:70"
  ],
  "publicErrorDetail": [
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
  "localHttp500": 70,
  "publicErrorDetail": 0
} as const

test('production boundary inventory matches the migration baseline', () => {
  const current = inventory()

  expect(current.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
  expect(current.localHttp500).toEqual(BASELINE.localHttp500)
  expect(current.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
})

test('records the closed Tag Monitoring local 500 debt', () => {
  const tagMonitoringDebt = BASELINE.localHttp500.filter((entry) =>
    entry.startsWith('src/controllers/tagMonitoring/'),
  )

  expect(tagMonitoringDebt).toHaveLength(0)
  expect(tagMonitoringDebt.filter((entry) => entry.includes('tagMonitoring.controller.ts'))).toHaveLength(0)
  expect(tagMonitoringDebt.filter((entry) => entry.includes('tagNotification.controller.ts'))).toHaveLength(0)
  expect(tagMonitoringDebt.filter((entry) => entry.includes('criticalTag.controller.ts'))).toHaveLength(0)
})
test('records the closed Sync Utilizadores local 500 debt', () => {
  const syncUtilizadoresDebt = BASELINE.localHttp500.filter((entry) =>
    entry.startsWith('src/controllers/syncUtilizadoresControllers/'),
  )

  expect(syncUtilizadoresDebt).toHaveLength(0)
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bo2-inventory-'))
  const ownedConsumerPath = path.join(tempRoot, 'security/validatedInput.ts')
  const fixturePath = path.join(tempRoot, '__task1_inventory_fixture.ts')
  const ownedMutation = `const __task3_inventory_mutation = process.env\n`
  const fixture = `const unsafe = process.env.UNSAFE_TEST\nconst fiveHundred = res.status(500)\nconst detail = res.json({ details: error.message })\n`

  try {
    fs.cpSync(sourceRoot, tempRoot, { recursive: true })
    const originalOwnedConsumer = fs.readFileSync(ownedConsumerPath, 'utf8')
    const baseline = inventory(tempRoot)
    expect(baseline.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
    expect(baseline.localHttp500).toEqual(BASELINE.localHttp500)
    expect(baseline.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
    fs.writeFileSync(ownedConsumerPath, `${ownedMutation}${originalOwnedConsumer}`, 'utf8')
    fs.writeFileSync(fixturePath, fixture, 'utf8')
    const mutated = inventory(tempRoot)
    expect(mutated.rawEnvironmentRead).toContain('src/security/validatedInput.ts:1')
    expect(mutated.rawEnvironmentRead).toContain('src/__task1_inventory_fixture.ts:1')
    expect(mutated.localHttp500).toContain('src/__task1_inventory_fixture.ts:2')
    expect(mutated.publicErrorDetail).toContain('src/__task1_inventory_fixture.ts:3')

    fs.writeFileSync(ownedConsumerPath, originalOwnedConsumer, 'utf8')
    fs.rmSync(fixturePath)

    const restored = inventory(tempRoot)
    expect(restored.rawEnvironmentRead).toEqual(BASELINE.rawEnvironmentRead)
    expect(restored.localHttp500).toEqual(BASELINE.localHttp500)
    expect(restored.publicErrorDetail).toEqual(BASELINE.publicErrorDetail)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }

  expect(fs.existsSync(tempRoot)).toBe(false)
})
