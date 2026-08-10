import fs from 'fs'
import path from 'path'

import packageJson from '../../package.json'

const repositoryRoot = path.resolve(__dirname, '../..')
const sourceScriptsRoot = path.join(repositoryRoot, 'src', 'scripts')

const toPosixPath = (value: string): string => value.replace(/\\/g, '/')

const listTypeScriptFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      return listTypeScriptFiles(absolutePath)
    }

    return entry.isFile() && entry.name.endsWith('.ts') ? [absolutePath] : []
  })

describe('operational script registry', () => {
  it('keeps every src/scripts program behind a package command', () => {
    const packageCommands = Object.values(packageJson.scripts).join('\n').replace(/\\/g, '/')

    const unregisteredScripts = listTypeScriptFiles(sourceScriptsRoot)
      .map(absolutePath => toPosixPath(path.relative(repositoryRoot, absolutePath)))
      .filter(sourcePath => {
        const compiledPath = sourcePath.replace(/^src\//, 'dist/').replace(/\.ts$/, '.js')
        return !packageCommands.includes(sourcePath) && !packageCommands.includes(compiledPath)
      })
      .sort()

    expect(unregisteredScripts).toEqual([])
  })
})
