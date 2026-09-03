import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const sourceRoot = path.resolve(__dirname, '../../src')

const rawEnvironmentRead = /\bprocess\.env\b/
const localFiveHundred = /\.status\(\s*500\s*\)/
const publicErrorDetail = /\.json\([^\n]*(?:error\.message|details\s*:)/

const RAW_ENV_COMPOSITION_ROOTS = new Set([
  'config/appConfig.ts',
  'config/renewalEnvironment.ts',
  ['config/test', 'Database.ts'].join(''),
  'scripts/maintenance/backfill-ac-webhook-receipt-leases.ts',
  'scripts/maintenance/ensure-users-v2-indexes.ts',
])

type Inventory = {
  rawEnvironmentRead: string[]
  localHttp500: string[]
  publicErrorDetail: string[]
}

// As suites do runner do Node vivem em src/**/__tests__ (vieram assim do main) e
// não são código de produção: lêem o ambiente para montar cenários. O inventário
// mede a fronteira de produção, por isso não as conta.
const TEST_DIRECTORY = '__tests__'

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === TEST_DIRECTORY ? [] : sourceFiles(absolutePath)
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

const BASELINE: Readonly<Record<keyof Inventory, readonly string[]>> = {
  "rawEnvironmentRead": [],
  "localHttp500": [
  ],
  "publicErrorDetail": [
  ]
}

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
  "localHttp500": 0,
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
