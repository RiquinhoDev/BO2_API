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

test('SCALE-01 inventory reconciles 40 complete reads', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  expect(inventory.summary).toEqual({ planned: 40, complete: 40, pending: 0 })
  expect(inventory.entries).toHaveLength(40)
  expect(inventory.scale02.summary).toEqual({ planned: 11, complete: 11, pending: 0, changed: 10, alreadyCompliant: 1 })
  expect(inventory.scale02.entries).toHaveLength(11)
  expect(run()).toContain('40 complete / 0 pending')
  expect(run()).toContain('SCALE-02 11 complete / 0 pending')
  expect(inventory.scale03.summary).toEqual({ planned: 24, complete: 24, pending: 0, changed: 20, alreadyCompliant: 4 })
  expect(inventory.scale03.entries).toHaveLength(24)
  expect(run()).toContain('SCALE-03 24 complete / 0 pending')
})

test('SCALE-03 records reviewed changes, compliance, and honest pending decisions', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  expect(inventory.scale03.entries.filter(({ status }: { status: string }) => status === 'complete')).toHaveLength(24)
  expect(inventory.scale03.entries.filter(({ status }: { status: string }) => status === 'pending')).toHaveLength(0)
  expect(inventory.scale03.entries.filter(({ disposition }: { disposition?: string }) => disposition === 'changed')).toHaveLength(20)
  expect(inventory.scale03.entries.filter(({ disposition }: { disposition?: string }) => disposition === 'already-compliant')).toHaveLength(4)
  expect(inventory.scale03.operational.status).toBe('pending')
})

test('SCALE-03 records constrained sequential dispositions with behavioral evidence', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const constrained = inventory.scale03.entries.filter(({ id }: { id: string }) => [
    'student-movement.ordered-writes',
    'guru-discrepancy.compensation',
    'guru-trials.expired-writes',
  ].includes(id))

  expect(constrained).toHaveLength(3)
  for (const entry of constrained) {
    expect(entry.status).toBe('complete')
    expect(entry.disposition).toBe('already-compliant')
    expect(entry.constraint).toMatch(/^constrained-sequential:/)
    expect(entry.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining('N=1/10/100'),
    ]))
  }
})

test('SCALE-03 records testimonial provider ordering and marker gating', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const testimonial = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'testimonial-tags.ordered-provider')

  expect(testimonial).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(testimonial.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('testimonialTagSync.service.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('partial provider failures'),
    expect.stringContaining('recent marker'),
    expect.stringContaining('local marker persistence failure'),
  ]))
})

test('SCALE-03 records activity snapshot partial-write accounting', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const snapshot = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'activity-snapshot.partial-writes')

  expect(snapshot).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(snapshot.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('activitySnapshotMonthly.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('totalProcessed'),
  ]))
})

test('SCALE-03 records achievement evaluation persistence accounting', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const achievements = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'achievements.partial-writes')

  expect(achievements).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(achievements.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('achievementEvaluation.service.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('processed'),
    expect.stringContaining('evaluated'),
    expect.stringContaining('errors'),
  ]))
})

test('SCALE-03 records weekly tag snapshot convergence and ordered repair', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const weekly = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'weekly-tags.snapshot-writes')

  expect(weekly).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(weekly.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('weeklyTagMonitoring.service.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('same-week replay'),
    expect.stringContaining('tagNotification.service.test.ts'),
    expect.stringContaining('concurrent duplicate claim'),
    expect.stringContaining('partial detail'),
  ]))
  expect(weekly.require).toEqual(expect.arrayContaining([
    'includeResultMetadata: true',
    'if (result.created) snapshotsCreated++',
    'if (result.created) notificationsCreated++',
  ]))
})

test('SCALE-03 records native-tag capture ordering, replay and identity protection', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const nativeTags = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'native-tags.compensating-writes')

  expect(nativeTags).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(nativeTags.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('nativeTagsCompensatingWrites.contract.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('concurrent initial captures'),
    expect.stringContaining('invalid batchSize'),
    expect.stringContaining('ACNativeTagsSnapshot.test.ts'),
  ]))
  expect(nativeTags.require).toEqual(expect.arrayContaining([
    'await captureNativeTags(email, source)',
    'Number.isInteger(batchSize)',
    'processed++',
    'captured++',
    'errors++',
  ]))
})

test('SCALE-03 records Guru cross-reference budget, failure accounting and stale identity', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const crossReference = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'guru-cross-reference.actions')

  expect(crossReference).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(crossReference.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('scaleRound1GuruCrossReference.contract.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('failed provider attempts'),
    expect.stringContaining('stale reconciliation'),
  ]))
  expect(crossReference.require).toEqual(expect.arrayContaining([
    'const canonicalSyncedEmails = syncedEmails === undefined',
    'const hasScopedSyncInput = syncedEmails !== undefined && syncedEmails.length > 0',
    'apiCallsUsed++',
    'result.errors++',
    'query.email = { $in: canonicalSyncedEmails ?? [] }',
    'email: { $nin: canonicalSyncedEmails }',
    'canonicalSyncedEmails.length >= minSize',
    'const syncedSet = new Set(canonicalSyncedEmails)',
  ]))
})

test('SCALE-03 records product-sales ordered traversal and partial retry accounting', () => {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
  const productSales = inventory.scale03.entries.find(({ id }: { id: string }) => id === 'product-sales.product-loop-writes')

  expect(productSales).toMatchObject({
    status: 'complete',
    disposition: 'changed',
    constraint: expect.stringMatching(/^constrained-sequential:/),
  })
  expect(productSales.evidence).toEqual(expect.arrayContaining([
    expect.stringContaining('scaleRound1ProductSalesLoop.contract.test.ts'),
    expect.stringContaining('N=1/10/100'),
    expect.stringContaining('without UserProducts'),
    expect.stringContaining('retries'),
    expect.stringContaining('null upsert'),
  ]))
  expect(productSales.require).toEqual(expect.arrayContaining([
    'for (const product of products)',
    'await persistProductSalesStats(product,',
    'result.productsSucceeded++',
    'result.errors.push',
  ]))
  expect(productSales.globalRequire).toEqual(expect.arrayContaining([
    'if (!persisted) throw new Error',
  ]))
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
test.each([
  ['activecampaign.manual-actions', 'src/controllers/acTags/activeCampaignOps.controller.ts', 'loadActiveUserProductsBounded(', 'removedActiveUserProductLoader('],
  ['activity-snapshot.cohort-fanout', 'src/services/syncUtilizadoresServices/activitySnapshot.service.ts', 'mapCohortMilestonesBounded(', 'removedCohortMilestoneMapper('],
])('SCALE-03 ratchet independently protects %s', (id, relativePath, required, replacement) => {
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale03-read-overlay-'))
  const target = path.join(overlay, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, fs.readFileSync(path.join(root, relativePath), 'utf8').split(required).join(replacement))
  try {
    expect(() => run({ NODE_ENV: 'test', SCALABILITY_READ_TEST_OVERLAY: overlay, SCALABILITY_READ_ALLOW_TEST_OVERLAY: '1' }))
      .toThrow(new RegExp(`${id}: missing`))
  } finally {
    fs.rmSync(overlay, { recursive: true, force: true })
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

test.each([
  ['plain find', 'EventType.find({})'],
  ['typed find', 'EventType.find<{ _id: string }>({})'],
  ['nested typed aggregate', 'EventType.aggregate<{ rows: Array<{ id: string }> }>([])'],
] as const)('ratchet rejects a new Mongoose list site written as %s', (_label, listSite) => {
  const relative = 'src/models/EventType.ts'
  const overlay = fs.mkdtempSync(path.join(os.tmpdir(), 'scale-read-overlay-'))
  const target = path.join(overlay, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, `${fs.readFileSync(path.join(root, relative), 'utf8')}\n${listSite}\n`)
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
