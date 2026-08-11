import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8')

test('event list reads cap at 200 and use stable ordering', () => {
  const source = read('src/routes/events.routes.ts')
  expect(source).toContain("import { boundedQueryLimit } from '../utils/queryBounds'")
  expect(source.match(/boundedQueryLimit/g)).toHaveLength(3)
  expect(source).toMatch(/scheduledAt: 1, _id: 1/)
  expect(source).toMatch(/scheduledAt: -1, _id: -1/)
  expect(source).toMatch(/label: 1, _id: 1/)
})

test('route and controller catalogs have explicit ceilings and stable tie-breakers', () => {
  const cases = [
    ['src/routes/renewalAc.routes.ts', /plannedAt: -1, _id: -1/],
    ['src/controllers/renewal.controller.ts', /offerCode: 1, _id: 1/],
    ['src/controllers/products/product.controller.ts', /createdAt: -1, _id: -1/],
  ] as const

  for (const [file, stableSort] of cases) {
    const source = read(file)
    expect(source).toContain('boundedQueryLimit')
    expect(source).toMatch(stableSort)
    expect(source).toMatch(/\.limit\(boundedQueryLimit\([^)]*, 200\)\)/)
  }

  const course = read('src/controllers/course.controller.ts')
  expect(course).toContain('Finite configuration catalog')
  expect(course.match(/\.limit\(200\)/g)).toHaveLength(2)
  expect(course).toMatch(/name: 1, _id: 1/)
  expect(course).toMatch(/priority: -1, _id: 1/)

  const profiles = read('src/controllers/products/productProfile.controller.ts')
  expect(profiles).toContain('Finite configuration catalog')
  expect(profiles).toContain('.limit(200)')
  expect(profiles).toMatch(/name: 1, _id: 1/)
})

test('product sales stats list and period reads share a finite catalog ceiling', () => {
  const controller = read('src/controllers/products/productSalesStats.controller.ts')
  const builder = read('src/services/productSalesStatsBuilder.ts')
  expect(controller).toContain('boundedQueryLimit')
  expect(controller).toMatch(/getProductSalesStats\(req\.query\.limit\)/)
  expect(controller).toMatch(/ProductSalesStats\.find\(query\)[\s\S]*sort\(\{ productCode: 1, _id: 1 \}\)[\s\S]*boundedQueryLimit/)
  expect(builder).toMatch(/getProductSalesStats\([\s\S]*boundedQueryLimit\(requestedLimit, 200\)/)
  expect(builder).toMatch(/'meta\.calculatedAt': -1, _id: -1/)
})

test('finite model configuration catalogs document and enforce their ceiling', () => {
  for (const file of [
    'src/models/acTags/TagRule.ts',
    'src/models/product/ProductProfile.ts',
  ]) {
    const source = read(file)
    expect(source).toContain('Finite configuration catalog')
    expect(source).toContain('.limit(200)')
    expect(source).toMatch(/\.sort\(\{[^}]*_id:/s)
  }
})
