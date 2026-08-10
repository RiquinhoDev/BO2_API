import fs from 'node:fs'
import path from 'node:path'

// Guard against reintroducing hardcoded integration credentials (the kind found
// in the deleted diagnose-classes-sync / sync-missing-classes scripts). Scans
// shipped source and ops scripts only — test fixtures legitimately hold dummy
// secrets, so tests/ is out of scope.
const roots = ['src', 'scripts'].map((dir) => path.resolve(__dirname, '../..', dir))

const patterns: Array<{ label: string; regex: RegExp }> = [
  { label: 'hardcoded Basic auth token', regex: /Basic\s+[A-Za-z0-9+/]{20,}={0,2}/ },
  {
    label: 'credential assigned a string literal',
    regex:
      /(HOTMART_CLIENT_ID|HOTMART_CLIENT_SECRET|client_secret|clientSecret|client_id|clientId|api[_]?key|access_token)\s*[:=]\s*['"][A-Za-z0-9._+/-]{16,}['"]/i,
  },
]

function sourceFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(absolutePath)
    return entry.isFile() && /\.(ts|js)$/.test(entry.name) ? [absolutePath] : []
  })
}

describe('no hardcoded integration secrets', () => {
  const files = roots.flatMap(sourceFiles)

  it('finds files to scan', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(patterns)('has no $label in shipped source or scripts', ({ regex }) => {
    const offenders = files.filter((file) => regex.test(fs.readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('does not reintroduce the deleted credential-bearing sync scripts', () => {
    const deleted = [
      'scripts/diagnose-classes-sync.ts',
      'scripts/diagnose-classes-sync.js',
      'scripts/sync-missing-classes.ts',
      'scripts/sync-missing-classes.js',
    ]
    for (const relative of deleted) {
      expect(fs.existsSync(path.resolve(__dirname, '../..', relative))).toBe(false)
    }
  })
})
