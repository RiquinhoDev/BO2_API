import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const script = path.join(root, 'scripts', 'generate-scalability-read-inventory.mjs')
const inventoryPath = path.join(root, 'src', 'contracts', 'scalability-read-inventory.json')

const run = (env: NodeJS.ProcessEnv = {}) => execFileSync(process.execPath, [script, '--check'], {
  cwd: root,
  env: { ...process.env, ...env },
  encoding: 'utf8',
})

test('SCALE-01 inventory reconciles 36 complete and 4 pending reads', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  expect(inventory.summary).toEqual({ planned: 40, complete: 36, pending: 4 })
  expect(inventory.entries).toHaveLength(40)
  expect(inventory.scale02.summary).toEqual({ planned: 11, complete: 11, pending: 0, changed: 10, alreadyCompliant: 1 })
  expect(inventory.scale02.entries).toHaveLength(11)
  expect(run()).toContain('36 complete / 4 pending')
  expect(run()).toContain('SCALE-02 11 complete / 0 pending')
  expect(inventory.scale03.summary).toEqual({ planned: 24, complete: 9, pending: 15, changed: 9 })
  expect(inventory.scale03.entries).toHaveLength(24)
  expect(run()).toContain('SCALE-03 9 complete / 15 pending')
})

test('SCALE-03 records exactly nine reviewed code changes and fifteen honest pending decisions', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  expect(inventory.scale03.entries.filter(({ status }: { status: string }) => status === 'complete')).toHaveLength(9)
  expect(inventory.scale03.entries.filter(({ status }: { status: string }) => status === 'pending')).toHaveLength(15)
  expect(inventory.scale03.entries.filter(({ disposition }: { disposition?: string }) => disposition === 'changed')).toHaveLength(9)
  expect(inventory.scale03.operational.status).toBe('pending')
})

test.each([
  ['fetchMultiple', 'return mapBounded(classes, cls => this.enrich(cls, options))', 'return classes.map(cls => this.enrich(cls, options))'],
  ['fetchAll', 'return mapBounded(classes, cls => this.enrich(cls, options))', 'return classes.map(cls => this.enrich(cls, options))'],
])('SCALE-03 ratchet independently rejects removal of %s bounded concurrency', (method, invariant, replacement) => {
  const relative = 'src/services/classes/mongooseClassDetails.reader.ts'
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale03-read-overlay-'))
  const target = path.join(overlay, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  const methodStart = source.indexOf(`async ${method}(`)
  const nextMethod = source.indexOf('\n  }', methodStart) + 4
  const mutatedMethod = source.slice(methodStart, nextMethod).replace(invariant, replacement)
  fs.writeFileSync(target, source.slice(0, methodStart) + mutatedMethod + source.slice(nextMethod))
  try {
    expect(() => run({ NODE_ENV: 'test', SCALABILITY_READ_TEST_OVERLAY: overlay, SCALABILITY_READ_ALLOW_TEST_OVERLAY: '1' }))
      .toThrow(new RegExp(`class-details.${method === 'fetchMultiple' ? 'fetch-multiple' : 'fetch-all'}: missing mapBounded`))
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true })
  }
})

test('SCALE-03 ratchet rejects falsely closing operational evidence', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  inventory.scale03.operational.status = 'complete'
  delete inventory.scale03.operational.reason
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scale03-read-inventory-'))
  const mutatedInventory = path.join(directory, 'inventory.json')
  fs.writeFileSync(mutatedInventory, JSON.stringify(inventory))
  try {
    expect(() => run({ SCALABILITY_READ_INVENTORY: mutatedInventory })).toThrow(/SCALE-03 operational evidence must remain pending/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
test('SCALE-02 ratchet records the exact set-based partition A decisions', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  expect(inventory.scale02.entries.map(({ id }: { id: string }) => id)).toEqual([
    'dashboard-quick.product-comparison',
    'dashboard-quick.products-breakdown',
    'dashboard.stats',
    'dashboard.engagement-distribution',
    'dashboard.compare-products',
    'engagement.global-summary',
    'engagement.stats',
    'cohort.retention',
    'cohort.metrics',
    'user.source-statistics',
    'user.data-source-stats',
  ])
  expect(inventory.scale02.entries.filter(({ disposition }: { disposition: string }) => disposition === 'changed')).toHaveLength(10)
  expect(inventory.scale02.entries.filter(({ disposition }: { disposition: string }) => disposition === 'already-compliant')).toHaveLength(1)
})
test('SCALE-02 ratchet rejects a removed set-based invariant', () => {
  const relative = 'src/models/user.behavior.ts'
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale02-read-overlay-'))
  const target = path.join(overlay, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, fs.readFileSync(path.join(root, relative), 'utf8').replace('$facet', '$removedFacet'))
  try {
    expect(() => run({
      NODE_ENV: 'test',
      SCALABILITY_READ_TEST_OVERLAY: overlay,
      SCALABILITY_READ_ALLOW_TEST_OVERLAY: '1',
    })).toThrow(/user.data-source-stats: missing .*facet/)
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true })
  }
})

test('SCALE-02 ratchet rejects changed versus already-compliant drift', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  inventory.scale02.entries[0].disposition = 'already-compliant'
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scale02-read-inventory-'))
  const mutatedInventory = path.join(directory, 'inventory.json')
  fs.writeFileSync(mutatedInventory, JSON.stringify(inventory))
  try {
    expect(() => run({ SCALABILITY_READ_INVENTORY: mutatedInventory })).toThrow(/SCALE-02 stale disposition counts/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
test('ratchet rejects a cap above 200 and leaves the production source restored', () => {
  const relative = 'src/routes/events.routes.ts'
  const sourcePath = path.join(root, relative)
  const original = fs.readFileSync(sourcePath, 'utf8')
  const originalHash = crypto.createHash('sha256').update(original).digest('hex')
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-read-overlay-'))
  const target = path.join(overlay, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, original.replace('.limit(200)', '.limit(201)'))

  try {
    expect(() => run({
      NODE_ENV: 'test',
      SCALABILITY_READ_TEST_OVERLAY: overlay,
      SCALABILITY_READ_ALLOW_TEST_OVERLAY: '1',
    })).toThrow(/cap exceeds 200/)
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true })
  }

  const restoredHash = crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex')
  expect(restoredHash).toBe(originalHash)
})

test('ratchet rejects a new Mongoose list site', () => {
  const relative = 'src/models/EventType.ts'
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-read-overlay-'))
  const target = path.join(overlay, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${fs.readFileSync(path.join(root, relative), 'utf8')}\nEventType.find({})\n`)
  try {
    expect(() => run({
      NODE_ENV: 'test',
      SCALABILITY_READ_TEST_OVERLAY: overlay,
      SCALABILITY_READ_ALLOW_TEST_OVERLAY: '1',
    })).toThrow(/new Mongoose list site/)
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true })
  }
})

test.each([
  ['missing stable tie-breaker', 'scheduledAt: 1, _id: 1', 'scheduledAt: 1', /missing scheduledAt: 1, _id: 1/],
  ['unbounded selected limit', 'boundedQueryLimit(req.query.limit, 6)', 'Number(req.query.limit)', /selected limit is optional or unbounded/],
] as const)('ratchet rejects %s', (_name, before, after, expected) => {
  const relative = 'src/routes/events.routes.ts'
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-read-overlay-'))
  const target = path.join(overlay, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, fs.readFileSync(path.join(root, relative), 'utf8').replace(before, after))
  try {
    expect(() => run({
      NODE_ENV: 'test',
      SCALABILITY_READ_TEST_OVERLAY: overlay,
      SCALABILITY_READ_ALLOW_TEST_OVERLAY: '1',
    })).toThrow(expected)
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true })
  }
})

test('ratchet rejects a stale inventory pointer', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  inventory.entries[0].start = 'missing handler marker'
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-read-inventory-'))
  const mutatedInventory = path.join(directory, 'inventory.json')
  fs.writeFileSync(mutatedInventory, JSON.stringify(inventory))
  try {
    expect(() => run({ SCALABILITY_READ_INVENTORY: mutatedInventory })).toThrow(/stale start pointer/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})