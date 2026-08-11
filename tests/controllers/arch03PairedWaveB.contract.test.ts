import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

test.each([
  ['src/controllers/tagMonitoring/criticalTag.controller.ts', 6],
  ['src/controllers/tagMonitoring/tagNotification.controller.ts', 6],
  ['src/controllers/tagMonitoring/tagMonitoring.controller.ts', 5],
  ['src/controllers/testimonials/testimonialQueries.controller.ts', 3],
  ['src/controllers/testimonials/testimonialCandidates.controller.ts', 2],
])('%s canonicalizes exactly the selected paired success exits', (file, expected) => {
  const source = read(file)
  expect(source).toContain("contracts/responseContract")
  expect(source.match(/successResponse\(/g)).toHaveLength(expected)
})

test('testimonial command owner remains outside this response wave', () => {
  const source = read('src/controllers/testimonials/testimonialCommands.controller.ts')
  expect(source).not.toContain("contracts/responseContract")
})
