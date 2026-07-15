const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const BASELINE_PATH = path.join(ROOT, 'config', 'typescript-ratchet-baseline.json')
const DIAGNOSTIC = /^(src[\\/].+?)\(\d+,\d+\): error TS\d+:/

function sortObject(values) {
  return Object.fromEntries(
    Object.entries(values).sort(([left], [right]) => left.localeCompare(right)),
  )
}

function buildTypeScriptSnapshot(output) {
  const directories = {}
  const dirtyFiles = new Set()
  let unscopedDiagnostics = 0

  for (const line of output.split(/\r?\n/)) {
    if (!line.includes('error TS')) continue

    const match = line.match(DIAGNOSTIC)
    if (!match) {
      unscopedDiagnostics += 1
      continue
    }

    const file = match[1].replace(/\\/g, '/')
    const parts = file.split('/')
    const directory = parts.length > 2 ? parts[1] : '(src-root)'

    directories[directory] = (directories[directory] || 0) + 1
    dirtyFiles.add(file)
  }

  return {
    directories: sortObject(directories),
    dirtyFiles: [...dirtyFiles].sort(),
    unscopedDiagnostics,
  }
}

function evaluateTypeScriptRatchet(current, baseline) {
  const violations = []

  if (!baseline || baseline.version !== 1) {
    return ['baseline inválido: versão 1 obrigatória']
  }

  for (const [directory, count] of Object.entries(current.directories)) {
    if (!Object.prototype.hasOwnProperty.call(baseline.directories, directory)) {
      violations.push(`grupo desconhecido: ${directory}`)
      continue
    }

    const maximum = baseline.directories[directory]
    if (count > maximum) {
      violations.push(`${directory}: ${count} erros excedem o baseline ${maximum}`)
    }
  }

  const allowedFiles = new Set(baseline.dirtyFiles)
  for (const file of current.dirtyFiles) {
    if (!allowedFiles.has(file)) {
      violations.push(`ficheiro limpo ganhou erros: ${file}`)
    }
  }

  if (current.unscopedDiagnostics > 0) {
    violations.push(
      `diagnósticos sem grupo reconhecido: ${current.unscopedDiagnostics}`,
    )
  }

  return violations
}

function generateTypeScriptBaseline(current) {
  return {
    version: 1,
    directories: sortObject(current.directories),
    dirtyFiles: [...current.dirtyFiles].sort(),
  }
}

function runTypeScript() {
  const tsc = require.resolve('typescript/bin/tsc')
  const result = spawnSync(
    process.execPath,
    [tsc, '--noEmit', '--pretty', 'false'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  if (result.error) throw result.error

  return buildTypeScriptSnapshot(
    [result.stdout, result.stderr].filter(Boolean).join('\n'),
  )
}

function readBaseline() {
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
}

function writeBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true })
  const temporaryPath = `${BASELINE_PATH}.tmp`
  fs.writeFileSync(temporaryPath, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  fs.renameSync(temporaryPath, BASELINE_PATH)
}

function formatSnapshot(snapshot) {
  const total = Object.values(snapshot.directories)
    .reduce((sum, count) => sum + count, 0)
  return `${total} erros em ${snapshot.dirtyFiles.length} ficheiros: ${JSON.stringify(snapshot.directories)}`
}

function main(args = process.argv.slice(2)) {
  const update = args.includes('--update')
  const current = runTypeScript()

  if (current.unscopedDiagnostics > 0) {
    console.error(`Ratchet recusado: ${current.unscopedDiagnostics} diagnósticos sem grupo`)
    return 1
  }

  if (update) {
    if (fs.existsSync(BASELINE_PATH)) {
      const violations = evaluateTypeScriptRatchet(current, readBaseline())
      if (violations.length > 0) {
        console.error(violations.join('\n'))
        return 1
      }
    }

    writeBaseline(generateTypeScriptBaseline(current))
    console.log(`Baseline TypeScript atualizado: ${formatSnapshot(current)}`)
    return 0
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.error('Baseline TypeScript ausente; execute npm run types:baseline:update')
    return 1
  }

  const violations = evaluateTypeScriptRatchet(current, readBaseline())
  if (violations.length > 0) {
    console.error(violations.join('\n'))
    return 1
  }

  console.log(`Ratchet TypeScript respeitado: ${formatSnapshot(current)}`)
  return 0
}

module.exports = {
  buildTypeScriptSnapshot,
  evaluateTypeScriptRatchet,
  generateTypeScriptBaseline,
  main,
}

if (require.main === module) {
  process.exitCode = main()
}
