import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../..')

const expectedCanonicalCalls: Record<string, number> = {
  'src/controllers/analytics/classAnalytics.controller.ts': 6,
  'src/controllers/classes/classHistory.controller.ts': 4,
  'src/controllers/classes/classDetails.controller.ts': 4,
  'src/controllers/products/productSalesStats.controller.ts': 1,
  'src/controllers/syncUtilizadoresControllers/syncReports.controller.ts': 3,
}

describe('ARCH03 safe partition B response boundary', () => {
  it.each(Object.entries(expectedCanonicalCalls))(
    '%s uses the canonical helper for all selected success exits',
    (relativePath, expectedCalls) => {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
      const calls = source.match(/\bsuccessResponse\s*\(/g) ?? []
      expect(source).toMatch(/import \{ successResponse \} from /)
      expect(calls).toHaveLength(expectedCalls)
    },
  )

  it('awaits the class recalculation before writing the response', () => {
    const source = fs.readFileSync(path.join(root, 'src/controllers/analytics/classAnalytics.controller.ts'), 'utf8')
    expect(source).toContain('const analytics = await service.recalculateClass(classId)')
    expect(source).not.toMatch(/void\s+service\.recalculateClass|service\.recalculateClass\([^)]*\)\.then/)
  })
})
