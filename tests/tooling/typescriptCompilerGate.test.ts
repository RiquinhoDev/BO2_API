import path from 'path'
import ts from 'typescript'

import packageJson from '../../package.json'

const repositoryRoot = path.resolve(__dirname, '../..')
const tsconfigPath = path.join(repositoryRoot, 'tsconfig.json')
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile)

if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
}

const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repositoryRoot)

describe('TypeScript compiler gate', () => {
  it('keeps direct strict compilation enforced by package scripts and tsconfig', () => {
    expect(packageJson.scripts['types:check']).toBe('tsc --noEmit --pretty false')
    expect(packageJson.scripts.build).toBe('tsc')
    expect(packageJson.scripts).not.toHaveProperty('types:baseline:update')
    expect(packageJson.scripts).not.toHaveProperty('prebuild')
    expect(parsed.options.strict).toBe(true)
    expect(parsed.options.noEmitOnError).toBe(true)
    expect(parsed.options.noEmit).not.toBe(true)
  })
})
