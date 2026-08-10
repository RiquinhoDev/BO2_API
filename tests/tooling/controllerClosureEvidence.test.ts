import fs from 'fs'
import path from 'path'

import packageJson from '../../package.json'
import ts from 'typescript'

const repositoryRoot = path.resolve(__dirname, '../..')
const tsconfigPath = path.join(repositoryRoot, 'tsconfig.json')
const tsconfigFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)

if (tsconfigFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(tsconfigFile.error.messageText, '\n'))
}

const tsconfig = tsconfigFile.config

const readSource = (relativePath: string): string =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')

describe('controller closure evidence', () => {
  it('keeps strict compiler gates and the surviving sync surface', () => {
    const syncRoutes = readSource('src/routes/sync.routes.ts')
    const syncStatsRoutes = readSource(
      'src/routes/syncUtilizadoresRoutes/syncStats.routes.ts',
    )
    const syncStatsController = readSource(
      'src/controllers/syncUtilizadoresControllers/syncStats.controller.ts',
    )
    const syncConflictsController = readSource(
      'src/controllers/syncStats/conflicts.controller.ts',
    )

    expect(tsconfig.compilerOptions.strict).toBe(true)
    expect(tsconfig.compilerOptions.noEmitOnError).toBe(true)
    expect(packageJson.scripts['types:check']).toBe('tsc --noEmit --pretty false')
    expect(packageJson.scripts).not.toHaveProperty('types:baseline:update')
    expect(fs.existsSync(path.join(repositoryRoot, 'scripts/ts-debt-ratchet.mjs'))).toBe(false)

    expect(syncRoutes).toContain("router.get('/stats'")
    expect(syncRoutes).toContain("router.get('/history'")
    expect(syncStatsRoutes).not.toMatch(/router\.get\(['\"]\/(stats|history)['\"]/)
    expect(syncStatsController).not.toMatch(/\b(getSyncStats|getSyncHistory)\b/)

    expect(syncStatsController).toMatch(
      /export const getSyncById = async \(\s*req: Request<\{ id: string \}>/,
    )

    for (const handler of ['getConflictById', 'resolveConflict', 'ignoreConflict']) {
      expect(syncConflictsController).toMatch(
        new RegExp(`export const ${handler} = async \\(\\s*req: Request<\\{ id: string \\}>`),
      )
    }
  })
})
