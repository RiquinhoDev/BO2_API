import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../..')

test.each([
  ['src/controllers/hotmart/hotmartProgress.controller.ts', 1],
  ['src/controllers/hotmart/hotmartDiagnostics.controller.ts', 1],
  ['src/controllers/syncUtilizadoresControllers/curseduca/users.controller.ts', 2],
] as const)('%s canonicalizes only the selected success exits', (file, count) => {
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  expect(source).toContain('successResponse')
  expect(source.match(/\bsuccessResponse\s*\(/g)).toHaveLength(count)
})
