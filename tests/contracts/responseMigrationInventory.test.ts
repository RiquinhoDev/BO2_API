import fs from 'node:fs'
import path from 'node:path'
import routeCatalog from '../../src/security/route-catalog.json'

const inventoryPath = path.join(process.cwd(), 'src', 'contracts', 'response-migration-inventory.json')
const routeId = (entry: { method: string; path: string }): string => `${entry.method} ${entry.path}`

describe('response migration inventory', () => {
  test('owns every mounted identity exactly once with explicit current and target decisions', () => {
    const exists = fs.existsSync(inventoryPath)
    expect(exists).toBe(true)
    if (!exists) return

    const inventory: Array<{
      identity: string
      owner: string
      currentFamily: string
      targetFamily: string
      frontConsumer: string | null
      status: string
    }> = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'))
    const identities = inventory.map((entry) => entry.identity).sort()

    expect(inventory).toHaveLength(412)
    expect(new Set(identities).size).toBe(412)
    expect(identities).toEqual(routeCatalog.map(routeId).sort())
    for (const entry of inventory) {
      expect(entry.owner).toMatch(/^src\/.+\.ts$/)
      expect(entry.currentFamily).toMatch(/^(?:success-data|public-document|redirect|stream-or-file|no-content|domain-envelope|raw-json|501-only)$/)
      expect(entry.targetFamily).toMatch(/^(?:success-data|public-document|redirect|stream-or-file|no-content)$/)
      expect(entry.frontConsumer === null || /^src\/.+\.(?:ts|tsx)$/.test(entry.frontConsumer)).toBe(true)
      expect(entry.status).toMatch(/^(?:complete|pending-migration)$/)
    }

    expect(inventory.filter((entry) => entry.status === 'complete')).toHaveLength(374)
    expect(inventory.filter((entry) => entry.status === 'pending-migration')).toHaveLength(38)

    // Planned 41 became 42 because the communication-history handler has a second
    // mounted identity. The exact-literal classifier also revealed product-sales
    // was already canonical, making this factual integration 43 identities.
    const factualIntegratedIdentities = [
      'DELETE /api/classes/:classId',
      'DELETE /api/guru/snapshots/:year/:month',
      'DELETE /api/guru/snapshots/all',
      'GET /api/activecampaign/communication-history',
      'GET /api/activecampaign/courses/clareza/students',
      'GET /api/activecampaign/courses/ogi/students',
      'GET /api/activecampaign/stats',
      'GET /api/activecampaign/products/:productId/tagged',
      'GET /api/analytics/product-sales',
      'GET /api/business-analytics/overview',
      'GET /api/business-analytics/products/comparison',
      'GET /api/classes/:classId/students',
      'GET /api/classes/inactivationLists',
      'GET /api/classes/listClasses',
      'GET /api/classes/stats',
      'GET /api/communication-history',
      'GET /api/course-lessons',
      'GET /api/courses/clareza/students',
      'GET /api/courses/ogi/students',
      'GET /api/guru/analytics/churn',
      'GET /api/guru/analytics/churn-live',
      'GET /api/guru/analytics/churn-live/status',
      'GET /api/guru/analytics/compare',
      'GET /api/guru/diagnose',
      'GET /api/guru/snapshots',
      'GET /api/guru/snapshots/:year/:month',
      'GET /api/guru/snapshots/churn',
      'GET /api/guru/status',
      'GET /api/guru/subscriptions',
      'GET /api/guru/trials',
      'GET /api/guru/trials/stats',
      'GET /api/renewal/offers',
      'GET /api/renewal/turmas',
      'GET /api/students/:userId/complete',
      'GET /api/sync/history',
      'GET /api/sync/reports',
      'POST /api/classes/addOrEditClass',
      'POST /api/classes/inactivationLists/create',
      'POST /api/classes/inactivationLists/revert/:id',
      'POST /api/guru/snapshots',
      'POST /api/guru/snapshots/historical',
      'PUT /api/classes/updateStatus',
      'PUT /api/guru/snapshots/:year/:month',
    ]
    expect(factualIntegratedIdentities).toHaveLength(43)
    for (const identity of factualIntegratedIdentities) {
      expect(inventory.find((entry) => entry.identity === identity)).toMatchObject({
        currentFamily: 'success-data',
        targetFamily: 'success-data',
        status: 'complete',
      })
    }
    expect(inventory.filter((entry) => entry.currentFamily === '501-only')).toEqual([])
  })
})