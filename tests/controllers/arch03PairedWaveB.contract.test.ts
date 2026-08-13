import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test.each([
  ['src/controllers/tagMonitoring/criticalTag.controller.ts', 7],
  ['src/controllers/tagMonitoring/tagNotification.controller.ts', 6],
  ['src/controllers/tagMonitoring/tagMonitoring.controller.ts', 5],
  ['src/controllers/testimonials/testimonialQueries.controller.ts', 4],
  ['src/controllers/testimonials/testimonialCandidates.controller.ts', 2],
])('%s canonicalizes every reviewed success exit', (file, expected) => {
  const source = read(file)
  expect(source).toContain("contracts/responseContract")
  expect(source.match(/successResponse\(/g)).toHaveLength(expected)
})

test('testimonial command owner is now fully inside the canonical response boundary', () => {
  const source = read('src/controllers/testimonials/testimonialCommands.controller.ts')
  expect(source).toContain("contracts/responseContract")
  expect(source.match(/successResponse\(/g)).toHaveLength(4)
  expect(source).toContain('await testimonial.save()')
  expect(source).toContain('findByIdAndDelete(id)')
})
