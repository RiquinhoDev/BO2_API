import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'

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

function mongooseSites() {
  const sites = []
  for (const absolute of walk(path.join(ROOT, 'src'))) {
    const relative = slash(path.relative(ROOT, absolute))
    const text = source(relative)
    const regex = /\b(?:[A-Z][A-Za-z0-9_]*|this)\.(find|aggregate)\s*\(/g
    let match
    while ((match = regex.exec(text))) {
      const line = text.slice(0, match.index).split('\n').length
      sites.push(`${relative}:${line}:${match[1]}`)
    }
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
  if (entry.policy !== 'aggregate' && !value.includes('_id')) fail(`${entry.id}: missing stable _id tie-breaker`)
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

function validate(inventory, currentBaseline) {
  if (inventory.version !== 1) fail('unsupported inventory version')
  if (inventory.entries.length !== 40) fail(`expected 40 planned entries, found ${inventory.entries.length}`)
  const ids = new Set(inventory.entries.map(entry => entry.id))
  if (ids.size !== inventory.entries.length) fail('duplicate inventory identity')
  const complete = inventory.entries.filter(entry => entry.status === 'complete').length
  const pending = inventory.entries.filter(entry => entry.status === 'pending').length
  if (complete !== 36 || pending !== 4) fail(`expected 36 complete / 4 pending, found ${complete} / ${pending}`)
  if (JSON.stringify(inventory.summary) !== JSON.stringify({ planned: 40, complete: 36, pending: 4 })) fail('stale summary')
  for (const entry of inventory.entries) validateEntry(entry)
  if (inventory.mongooseListBaseline.count !== currentBaseline.count || inventory.mongooseListBaseline.hash !== currentBaseline.hash) {
    fail(`new Mongoose list site or baseline drift (${inventory.mongooseListBaseline.count} -> ${currentBaseline.count})`)
  }
  return { complete, pending }
}

const command = process.argv[2]
if (!['--check', '--write'].includes(command)) fail('use --check or --write')
const inventory = readJson(INVENTORY)
const currentBaseline = mongooseSites()
const result = validate(inventory, currentBaseline)
if (command === '--write') fs.writeFileSync(INVENTORY, `${JSON.stringify(inventory, null, 2)}\n`)
process.stdout.write(`SCALE-01 inventory OK: ${result.complete} complete / ${result.pending} pending; ${currentBaseline.count} Mongoose list sites\n`)
