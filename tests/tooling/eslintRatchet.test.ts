import fs from 'fs'
import path from 'path'

const { ESLint } = require('eslint')
const eslintConfig = require('../../eslint.config.js')
const suppressions = require('../../eslint-suppressions.json')

const root = path.resolve(__dirname, '../..')
const cleanProbe = path.join(root, 'src', '__eslint_clean_probe__.ts')
const dirtyFile = path.join(root, 'src', 'controllers', 'users.controller.ts')

function createLinter() {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: eslintConfig,
    applySuppressions: true,
  })
}

function ruleIds(result: { messages: Array<{ ruleId: string | null }> }) {
  return result.messages.map((message) => message.ruleId)
}

describe('ESLint ratchet', () => {
  test('rejeita console novo num ficheiro limpo', async () => {
    const [result] = await createLinter().lintText(
      "console.log('novo')\n",
      { filePath: cleanProbe },
    )

    expect(result.errorCount).toBe(1)
    expect(ruleIds(result)).toEqual(['no-console'])
  })

  test('rejeita o console seguinte num ficheiro já suprimido', async () => {
    const source = fs.readFileSync(dirtyFile, 'utf8')

    const [result] = await createLinter().lintText(
      `${source}\nconsole.log('2682')\n`,
      { filePath: dirtyFile },
    )

    const baseline = suppressions['src/controllers/users.controller.ts']['no-console'].count
    expect(result.errorCount).toBe(baseline + 1)
    expect(new Set(ruleIds(result))).toEqual(new Set(['no-console']))
  })

  test('rejeita eval e Function dinâmica em código novo', async () => {
    const [result] = await createLinter().lintText(
      "eval('value')\nnew Function('return value')\n",
      { filePath: cleanProbe },
    )

    expect(ruleIds(result)).toEqual(
      expect.arrayContaining(['no-eval', 'no-new-func']),
    )
  })

  test('rejeita variável nova não utilizada', async () => {
    const [result] = await createLinter().lintText(
      'const neverUsed = 1\nexport {}\n',
      { filePath: cleanProbe },
    )

    expect(ruleIds(result)).toContain('@typescript-eslint/no-unused-vars')
  })

  test('rejeita explicit any novo num ficheiro limpo (ratcheted)', async () => {
    const [result] = await createLinter().lintText(
      'export const legacyValue: any = 1\n',
      { filePath: cleanProbe },
    )

    expect(ruleIds(result)).toContain('@typescript-eslint/no-explicit-any')
  })
})
