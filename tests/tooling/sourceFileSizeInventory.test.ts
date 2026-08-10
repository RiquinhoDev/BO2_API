import fs from 'node:fs'
import path from 'node:path'
import baseline from './sourceFileSizeBaseline.json'

const LIMIT = 500

type SizeInventory = Record<string, number>

function physicalLines(content: string): number {
  const withoutFinalTerminator = content.replace(/\r?\n$/, '')
  return withoutFinalTerminator === '' ? 0 : withoutFinalTerminator.split(/\r?\n/).length
}

function collectTypeScriptSizes(directory: string, root = directory): SizeInventory {
  const inventory: SizeInventory = {}

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      Object.assign(inventory, collectTypeScriptSizes(absolutePath, root))
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, '/')
      inventory[relativePath] = physicalLines(fs.readFileSync(absolutePath, 'utf8'))
    }
  }

  return inventory
}

export function auditSourceSizes(current: SizeInventory, allowedDebt: SizeInventory): string[] {
  const failures: string[] = []

  for (const [file, lines] of Object.entries(current)) {
    if (lines <= LIMIT) continue
    const ceiling = allowedDebt[file]
    if (ceiling === undefined) failures.push(`novo ficheiro acima de ${LIMIT}: ${file} (${lines})`)
    else if (lines > ceiling) failures.push(`ficheiro cresceu acima do baseline: ${file} (${ceiling} -> ${lines})`)
  }

  for (const [file] of Object.entries(allowedDebt)) {
    if ((current[file] ?? 0) <= LIMIT) failures.push(`baseline não podado: ${file}`)
  }

  return failures
}

describe('source file size inventory', () => {
  it('ratchets every handwritten TypeScript file above 500 physical lines', () => {
    const current = collectTypeScriptSizes(path.join(process.cwd(), 'src'))
    expect(auditSourceSizes(current, baseline)).toEqual([])
  })

  it('names a new file that crosses the limit', () => {
    expect(auditSourceSizes({ 'src/clean/newModule.ts': 501 }, {})).toEqual([
      'novo ficheiro acima de 500: src/clean/newModule.ts (501)'
    ])
  })

  it('fails closed when debt moves or an obsolete baseline is not pruned', () => {
    expect(auditSourceSizes(
      { 'src/legacy/a.ts': 501, 'src/legacy/b.ts': 600 },
      { 'src/legacy/a.ts': 550, 'src/legacy/c.ts': 700 }
    )).toEqual([
      'novo ficheiro acima de 500: src/legacy/b.ts (600)',
      'baseline não podado: src/legacy/c.ts'
    ])
  })
})
