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

    expect(inventory).toHaveLength(409)
    expect(new Set(identities).size).toBe(409)
    expect(identities).toEqual(routeCatalog.map(routeId).sort())
    for (const entry of inventory) {
      expect(entry.owner).toMatch(/^src\/.+\.ts$/)
      expect(entry.currentFamily).toMatch(/^(?:success-data|public-document|webhook-ack|redirect|stream-or-file|no-content|domain-envelope|raw-json|501-only)$/)
      expect(entry.targetFamily).toMatch(/^(?:success-data|public-document|webhook-ack|redirect|stream-or-file|no-content)$/)
      expect(entry.frontConsumer === null || /^src\/.+\.(?:ts|tsx)$/.test(entry.frontConsumer)).toBe(true)
      expect(entry.status).toMatch(/^(?:complete|pending-migration)$/)
    }

    expect(inventory.filter((entry) => entry.status === 'complete')).toHaveLength(409)
    expect(inventory.filter((entry) => entry.status === 'pending-migration')).toHaveLength(0)

    expect(inventory.filter((entry) => entry.currentFamily === '501-only')).toEqual([])
  })
})