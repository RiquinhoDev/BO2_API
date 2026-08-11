import fs from 'node:fs'
import path from 'node:path'
import curseducaRouter from '../../src/routes/curseduca.routes'
import syncRouter from '../../src/routes/sync.routes'

const routePaths = (router: typeof curseducaRouter) => router.stack
  .map((layer) => layer.route?.path)
  .filter((value): value is string => typeof value === 'string')

it('does not mount removed CursEduca placeholder capabilities', () => {
  expect(routePaths(curseducaRouter)).not.toEqual(expect.arrayContaining([
    '/debug', '/groups', '/members', '/members/by', '/report', '/reports/access', '/user', '/users', '/cleanup',
  ]))
  expect(routePaths(curseducaRouter)).toEqual(expect.arrayContaining([
    '/dashboard', '/users-with-classes', '/user/:userId/classes', '/sync/universal', '/sync/status',
  ]))
})

it('does not mount placeholder Discord sync while preserving the real import route', () => {
  expect(routePaths(syncRouter)).not.toEqual(expect.arrayContaining([
    '/discord', '/discord/batch', '/discord/csv',
  ]))
  const usersRoutes = fs.readFileSync(path.join(process.cwd(), 'src/routes/users.routes.ts'), 'utf8')
  expect(usersRoutes).toContain('router.post("/syncDiscordAndHotmart", usersImportUpload, syncDiscordAndHotmart)')
})