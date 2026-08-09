import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(__dirname, '../..')
const legacyController = path.join(
  projectRoot,
  'src/controllers/syncUtilizadoresControllers/hotmart.controller.ts'
)
const routesFile = path.join(projectRoot, 'src/routes/hotmart.routes.ts')
const barrelFile = path.join(projectRoot, 'src/controllers/hotmart/index.ts')
const expectedHandlers = [
  'compareSyncMethods',
  'findHotmartUser',
  'getHotmartProductBySubdomain',
  'getHotmartProductUsers',
  'getHotmartProducts',
  'getHotmartStats',
  'syncHotmartUsers',
  'syncHotmartUsersUniversal',
  'syncProgressOnly',
  'syncProgressOnlyUniversal'
]

test('exports exactly the ten mounted Hotmart handler names from the focused barrel', () => {
  const barrel = fs.readFileSync(barrelFile, 'utf8')

  expect(barrel).not.toContain('export *')
  for (const handler of expectedHandlers) {
    expect(barrel.match(new RegExp(`\\b${handler}\\b`, 'g'))).toHaveLength(1)
  }
  const exportedIdentifiers = barrel
    .replace(/from\s+'[^']+'/g, '')
    .match(/\b(?:compareSyncMethods|findHotmartUser|getHotmart\w+|sync\w+)\b/g)
  expect(exportedIdentifiers?.sort()).toEqual(expectedHandlers)
})

test('routes consume only the focused barrel and the legacy controller is absent', () => {
  const routes = fs.readFileSync(routesFile, 'utf8')

  expect(routes).toContain("from '../controllers/hotmart'")
  expect(routes).not.toContain('syncUtilizadoresControllers/hotmart.controller')
  expect(fs.existsSync(legacyController)).toBe(false)
})