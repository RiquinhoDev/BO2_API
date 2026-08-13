import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const ROOT = process.cwd()
const INVENTORY = process.env.SCALABILITY_READ_INVENTORY ?? path.join(ROOT, 'src', 'contracts', 'scalability-read-inventory.json')
const OVERLAY = process.env.SCALABILITY_READ_TEST_OVERLAY
const ALLOW_OVERLAY = process.env.SCALABILITY_READ_ALLOW_TEST_OVERLAY
const slash = value => value.split(path.sep).join('/')

function fail(message) { throw new Error(`SCALE-01: ${message}`) }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')) }

function validateOverlay() {
  if (!OVERLAY) {
    if (ALLOW_OVERLAY) fail('overlay opt-in supplied without overlay')
    return undefined
  }
  if (process.env.NODE_ENV !== 'test' || ALLOW_OVERLAY !== '1') fail('test overlay requires NODE_ENV=test and explicit opt-in')
  const real = fs.realpathSync(OVERLAY)
  const temp = fs.realpathSync(os.tmpdir())
  const relative = path.relative(temp, real)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('test overlay must be inside the OS temp directory')
  return real
}

const overlayRoot = validateOverlay()
function source(relative) {
  const canonical = path.join(ROOT, relative)
  const candidate = overlayRoot && path.join(overlayRoot, relative)
  return fs.readFileSync(candidate && fs.existsSync(candidate) ? candidate : canonical, 'utf8')
}

function walk(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(absolute, files)
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(absolute)
  }
  return files
}

function isTrackedMongooseReceiver(node) {
  return (ts.isIdentifier(node) && /^[A-Z]/.test(node.text)) || node.kind === ts.SyntaxKind.ThisKeyword
}

function mongooseSites() {
  const sites = []
  for (const absolute of walk(path.join(ROOT, 'src'))) {
    const relative = slash(path.relative(ROOT, absolute))
    const text = source(relative)
    const sourceFile = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    function visit(node) {
      if (
        ts.isCallExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && (node.expression.name.text === 'find' || node.expression.name.text === 'aggregate')
        && isTrackedMongooseReceiver(node.expression.expression)
      ) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.expression.getStart(sourceFile)).line + 1
        sites.push(`${relative}:${line}:${node.expression.name.text}`)
      }
      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
  }
  sites.sort()
  return {
    count: sites.length,
    hash: crypto.createHash('sha256').update(sites.join('\n')).digest('hex'),
  }
}

function segment(entry) {
  const text = source(entry.file)
  const first = text.indexOf(entry.start)
  if (first < 0) fail(`${entry.id}: stale start pointer ${entry.start}`)
  if (text.indexOf(entry.start, first + entry.start.length) >= 0) fail(`${entry.id}: start pointer is not unique`)
  const last = entry.end ? text.indexOf(entry.end, first + entry.start.length) : text.length
  if (entry.end && last < 0) fail(`${entry.id}: stale end pointer ${entry.end}`)
  return { text, value: text.slice(first, last) }
}

function validateEntry(entry) {
  if (!entry.id || !entry.file || !entry.start || !['complete', 'pending'].includes(entry.status)) fail('invalid inventory entry')
  const { text, value } = segment(entry)
  if (entry.status === 'pending') {
    if (!entry.reason || entry.reason.length < 20) fail(`${entry.id}: pending reason missing`)
    return
  }
  for (const token of entry.require ?? []) if (!value.includes(token)) fail(`${entry.id}: missing ${token}`)
  for (const token of entry.forbid ?? []) if (value.includes(token)) fail(`${entry.id}: forbidden ${token}`)
  for (const match of value.matchAll(/\.limit\(\s*(\d+)/g)) {
    if (Number(match[1]) > 200) fail(`${entry.id}: cap exceeds 200`)
  }
  if (!['aggregate', 'driver-cursor'].includes(entry.policy) && !value.includes('_id')) fail(`${entry.id}: missing stable _id tie-breaker`)
  if (entry.policy === 'driver-cursor' && (!value.includes('.cursor({ batchSize: 200 })') || value.includes('.limit(50000)'))) fail(`${entry.id}: complete driver cursor is not bounded`)
  if (entry.policy === 'bounded') {
    if (!value.includes('.limit(') || !value.includes('boundedQueryLimit')) fail(`${entry.id}: selected limit is optional or unbounded`)
    if (/\.limit\(\s*(?:Number\(|parseInt\()/.test(value)) fail(`${entry.id}: selected limit is optional or unbounded`)
  }
  if (entry.policy === 'batch' && (!value.includes('collectBatches') || !value.includes('boundedQueryLimit'))) fail(`${entry.id}: complete scan is not bounded in batches`)
  if (entry.policy === 'aggregate-bounded' && (!value.includes('$limit') || !value.includes('boundedQueryLimit'))) {
    fail(`${entry.id}: aggregate limit is optional or unbounded`)
  }
  if (entry.policy === 'finite') {
    if (!value.includes('.limit(200)')) fail(`${entry.id}: finite catalog ceiling missing`)
    if (!entry.reason || !text.includes('Finite configuration catalog')) fail(`${entry.id}: finite allowlist reason missing`)
  }
}

function validateScale02(scale02) {
  const expectedSummary = { planned: 11, complete: 11, pending: 0, changed: 10, alreadyCompliant: 1 }
  if (!scale02 || JSON.stringify(scale02.summary) !== JSON.stringify(expectedSummary)) fail('SCALE-02 stale summary')
  if (!Array.isArray(scale02.entries) || scale02.entries.length !== 11) fail('SCALE-02 expected 11 decisions')
  const ids = new Set(scale02.entries.map(entry => entry.id))
  if (ids.size !== scale02.entries.length) fail('SCALE-02 duplicate identity')
  const changed = scale02.entries.filter(entry => entry.disposition === 'changed').length
  const alreadyCompliant = scale02.entries.filter(entry => entry.disposition === 'already-compliant').length
  if (changed !== 10 || alreadyCompliant !== 1) fail('SCALE-02 stale disposition counts')
  if (scale02.entries.some(entry => entry.status !== 'complete')) fail('SCALE-02 contains incomplete decision')
  for (const entry of scale02.entries) validateEntry(entry)
  return { complete: scale02.entries.length, pending: 0 }
}
function validateScale03(scale03) {
  const expectedSummary = { planned: 24, complete: 14, pending: 10, changed: 13, alreadyCompliant: 1 }
  if (!scale03 || JSON.stringify(scale03.summary) !== JSON.stringify(expectedSummary)) fail('SCALE-03 stale summary')
  if (!Array.isArray(scale03.entries) || scale03.entries.length !== 24) fail('SCALE-03 expected 24 decisions')
  const ids = new Set(scale03.entries.map(entry => entry.id))
  if (ids.size !== scale03.entries.length) fail('SCALE-03 duplicate identity')
  const expectedIds = [
    'product-sales.user-products-set',
    'product-sales.first-enrollment-order',
    'class-details.fetch-multiple',
    'class-details.fetch-all',
    'course-preview.dry-run',
    'analytics-cache.singleflight',
    'engagement-summary.singleflight',
    'raiox.raw-scan',
    'raiox.peer-scan',
    'student-movement.ordered-writes',
    'activity-snapshot.partial-writes',
    'achievements.partial-writes',
    'guru-discrepancy.compensation',
    'guru-trials.provider-writes',
    'activecampaign.manual-actions',
    'native-tags.compensating-writes',
    'testimonial-tags.ordered-provider',
    'weekly-tags.snapshot-writes',
    'guru-cross-reference.actions',
    'analytics-cache.stats-scan',
    'analytics-cache.warmup',
    'activity-snapshot.cohort-fanout',
    'guru-trials.expired-writes',
    'product-sales.product-loop-writes',
  ]
  if (JSON.stringify(scale03.entries.map(entry => entry.id)) !== JSON.stringify(expectedIds)) fail('SCALE-03 identity drift')
  const complete = scale03.entries.filter(entry => entry.status === 'complete')
  const pending = scale03.entries.filter(entry => entry.status === 'pending')
  if (!scale03.operational || scale03.operational.status !== 'pending' || !scale03.operational.reason) {
    fail('SCALE-03 operational evidence must remain pending')
  }
  if (complete.length !== 14 || pending.length !== 10) fail('SCALE-03 stale status counts')
  if (complete.filter(entry => entry.disposition === 'changed').length !== 13 || complete.filter(entry => entry.disposition === 'already-compliant').length !== 1) {
    fail('SCALE-03 stale disposition counts')
  }
  for (const entry of scale03.entries) {
    if (!entry.id || !entry.file || !entry.start || !['complete', 'pending'].includes(entry.status)) fail('SCALE-03 invalid inventory entry')
    const selected = segment(entry)
    if (entry.status === 'pending') {
      if (!entry.reason || entry.reason.length < 20) fail(`${entry.id}: pending reason missing`)
      continue
    }
    for (const token of entry.require ?? []) if (!selected.value.includes(token)) fail(`${entry.id}: missing ${token}`)
    for (const token of entry.globalRequire ?? []) if (!selected.text.includes(token)) fail(`${entry.id}: missing global ${token}`)
  }
  return { complete: complete.length, pending: pending.length }
}
function validate(inventory, currentBaseline) {
  if (inventory.version !== 1) fail('unsupported inventory version')
  if (inventory.entries.length !== 40) fail(`expected 40 planned entries, found ${inventory.entries.length}`)
  const ids = new Set(inventory.entries.map(entry => entry.id))
  if (ids.size !== inventory.entries.length) fail('duplicate inventory identity')
  const complete = inventory.entries.filter(entry => entry.status === 'complete').length
  const pending = inventory.entries.filter(entry => entry.status === 'pending').length
  if (complete !== 40 || pending !== 0) fail(`expected 40 complete / 0 pending, found ${complete} / ${pending}`)
  if (JSON.stringify(inventory.summary) !== JSON.stringify({ planned: 40, complete: 40, pending: 0 })) fail('stale summary')
  for (const entry of inventory.entries) validateEntry(entry)
  const scale02 = validateScale02(inventory.scale02)
  const scale03 = validateScale03(inventory.scale03)
  if (inventory.mongooseListBaseline.count !== currentBaseline.count || inventory.mongooseListBaseline.hash !== currentBaseline.hash) {
    fail(`new Mongoose list site or baseline drift (${inventory.mongooseListBaseline.count}:${inventory.mongooseListBaseline.hash} -> ${currentBaseline.count}:${currentBaseline.hash})`)
  }
  return { complete, pending, scale02, scale03 }
}

const command = process.argv[2]
if (!['--check', '--write'].includes(command)) fail('use --check or --write')
const inventory = readJson(INVENTORY)
const currentBaseline = mongooseSites()
const result = validate(inventory, currentBaseline)
if (command === '--write') fs.writeFileSync(INVENTORY, `${JSON.stringify(inventory, null, 2)}\n`)
process.stdout.write(`SCALE-01 inventory OK: ${result.complete} complete / ${result.pending} pending; SCALE-02 ${result.scale02.complete} complete / ${result.scale02.pending} pending; SCALE-03 ${result.scale03.complete} complete / ${result.scale03.pending} pending; ${currentBaseline.count} Mongoose list sites\n`)
