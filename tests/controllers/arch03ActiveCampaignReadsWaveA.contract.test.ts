import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('ARCH03 ActiveCampaign reads wave A exact identity contract', () => {
  it('keeps the four course identities as aliases of the same two read handlers', () => {
    const activeCampaignRoutes = source('src/routes/ACroutes/activecampaign.routes.ts')
    const courseRoutes = source('src/routes/course.routes.ts')

    expect(activeCampaignRoutes).toContain("router.get('/courses/clareza/students', asyncRoute(getClarezaStudents))")
    expect(activeCampaignRoutes).toContain("router.get('/courses/ogi/students', asyncRoute(getOGIStudents))")
    expect(courseRoutes).toContain("router.get('/clareza/students', asyncRoute(getClarezaStudents))")
    expect(courseRoutes).toContain("router.get('/ogi/students', asyncRoute(getOGIStudents))")
  })

  it('keeps the other three selected GET mappings exact', () => {
    const routes = source('src/routes/ACroutes/activecampaign.routes.ts')

    expect(routes).toContain("router.get('/stats', asyncRoute(getStats))")
    expect(routes).toContain("router.get('/communication-history', asyncRoute(getCommunicationHistory))")
    expect(routes).toContain("router.get('/v2/products/:productId/tagged', asyncRoute(getUsersWithTagsInProduct))")
  })
})