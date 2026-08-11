import fs from 'node:fs'
import path from 'node:path'

import baseline from './controllerResponsibilityBaseline.json'

const CONTROLLERS_ROOT = path.join(process.cwd(), 'src/controllers')

const INTENTIONAL_HTTP_ADAPTERS = new Set([
  'src/controllers/clarezaController.ts',
  'src/controllers/studentsController.ts',
])

function collectTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    return entry.isDirectory()
      ? collectTypeScriptFiles(absolutePath)
      : entry.isFile() && entry.name.endsWith('.ts')
        ? [path.relative(process.cwd(), absolutePath).replace(/\\/g, '/')]
        : []
  })
}

export function findMisplacedControllerModules(files: readonly string[]): string[] {
  return files
    .filter((file) => {
      const basename = path.posix.basename(file)
      return basename !== 'index.ts'
        && !basename.endsWith('.controller.ts')
        && !INTENTIONAL_HTTP_ADAPTERS.has(file)
    })
    .sort()
}

describe('controller responsibility boundary', () => {
  it('ratchets non-HTTP modules misplaced under controllers', () => {
    const current = findMisplacedControllerModules(collectTypeScriptFiles(CONTROLLERS_ROOT))
    expect(current).toEqual(baseline)
    expect(current).toEqual([])
  })

  it('fails closed for new support, mapping and service modules', () => {
    const current = findMisplacedControllerModules([
      'src/controllers/healthy.controller.ts',
      'src/controllers/domain/index.ts',
      'src/controllers/new/support.ts',
      'src/controllers/new/mapping.ts',
      'src/controllers/new/work.service.ts',
    ])

    expect(current).toEqual([
      'src/controllers/new/mapping.ts',
      'src/controllers/new/support.ts',
      'src/controllers/new/work.service.ts',
    ])
  })
})
