import fs from 'fs'
import path from 'path'

const root = path.resolve(__dirname, '../..')

const expectedCanonicalCalls: Record<string, number> = {
  'src/controllers/products/productProfile.controller.ts': 6,
  'src/controllers/lessons.controller.ts': 5,
  'src/controllers/syncUtilizadoresControllers/curseduca/products.controller.ts': 4,
  'src/controllers/hotmart/hotmartCatalog.controller.ts': 4,
  'src/controllers/course.controller.ts': 2,
  'src/controllers/discovery.controller.ts': 3,
}

describe('ARCH03 accelerated partition B response boundary', () => {
  it.each(Object.entries(expectedCanonicalCalls))(
    '%s uses the canonical helper for every selected success exit',
    (relativePath, expectedCalls) => {
      const source = fs.readFileSync(path.join(root, relativePath), 'utf8')
      const calls = source.match(/\bsuccessResponse\s*\(/g) ?? []

      expect(source).toMatch(/import \{ successResponse \} from /)
      expect(calls).toHaveLength(expectedCalls)
    },
  )
})
