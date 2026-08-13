import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

test.each([
  ['src/routes/events.routes.ts', 12],
  ['src/routes/validationLogs.routes.ts', 2],
  ['src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller.ts', 5],
  ['src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller.ts', 2],
  ['src/controllers/syncUtilizadoresControllers/cronManagement/tagRules.controller.ts', 2],
  ['src/controllers/guruInactivationRead.controller.ts', 3],
])('%s canonicalizes every reviewed success identity', (file, expected) => {
  const source = read(file)
  expect(source).toContain('contracts/responseContract')
  expect(source.match(/successResponse\(/g)).toHaveLength(expected)
})

test('events owner now canonicalizes the formerly excluded success exits', () => {
  const source = read('src/routes/events.routes.ts')
  expect(source).toContain('res.json(successResponse({ events }))')
  expect(source).toContain('res.json(successResponse({ event }))')
  expect(source).toContain('res.status(201).json(successResponse({ eventType }')
})

test('cron operations and queries keep their behavior inside the canonical boundary', () => {
  const operations = read('src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller.ts')
  const queries = read('src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller.ts')
  expect(operations).toContain('Tag Rules Only executado com sucesso')
  expect(operations).toContain('res.status(200).json(successResponse(')
  expect(queries).toContain('res.status(200).json(successResponse({')
})
