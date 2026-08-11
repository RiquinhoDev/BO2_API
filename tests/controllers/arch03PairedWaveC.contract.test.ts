import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test.each([
  ['src/routes/events.routes.ts', 7],  ['src/routes/validationLogs.routes.ts', 2],
  ['src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller.ts', 3],
  ['src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller.ts', 1],
  ['src/controllers/syncUtilizadoresControllers/cronManagement/tagRules.controller.ts', 2],
  ['src/controllers/guruInactivationRead.controller.ts', 3],
])('%s canonicalizes exactly the selected success identities', (file, expected) => {
  const source = read(file)
  expect(source).toContain('contracts/responseContract')
  expect(source.match(/successResponse\(/g)).toHaveLength(expected)
})

test('events non-consumer owner exits remain outside this wave', () => {
  const source = read('src/routes/events.routes.ts')
  expect(source).toContain("res.json({ events })")
  expect(source).toContain("res.json({ event })")
  expect(source).toContain("res.status(201).json({ eventType")
})

test('cron non-selected operations and queries remain outside this wave', () => {
  const operations = read('src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller.ts')
  const queries = read('src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller.ts')
  expect(operations).toContain('Tag Rules Only executado com sucesso')
  expect(queries).toContain("res.status(200).json({")
})
