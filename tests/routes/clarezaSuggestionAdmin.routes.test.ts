import fs from 'node:fs'
import path from 'node:path'

describe('Clareza suggestion administration routes', () => {
  it('requires SUPER_ADMIN before list and export handlers', () => {
    const source = fs.readFileSync(path.resolve('src/routes/clareza.routes.ts'), 'utf8')

    expect(source).toContain("router.get('/suggestions/admin', authorize('SUPER_ADMIN'), asyncRoute(clarezaSuggestionAdminController.list))")
    expect(source).toContain("router.get('/suggestions/admin/export', authorize('SUPER_ADMIN'), asyncRoute(clarezaSuggestionAdminController.exportCsv))")
  })

  it('protects the single refresh and alias operational boundary with SUPER_ADMIN', () => {
    const source = fs.readFileSync(path.resolve('src/routes/clareza.routes.ts'), 'utf8')

    expect(source).toContain("router.post('/operations', authorize('SUPER_ADMIN'), asyncRoute(clarezaOperationsController))")
  })
})
