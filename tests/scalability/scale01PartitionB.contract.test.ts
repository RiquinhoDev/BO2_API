import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.resolve(file), 'utf8')

test('testimonial and snapshot reads use capped limits and stable tie-breakers', () => {
  for (const file of [
    'src/controllers/testimonials/testimonialQueries.controller.ts',
    'src/controllers/testimonials/testimonialCandidates.controller.ts',
    'src/controllers/guruSnapshots/crud.controller.ts',
    'src/controllers/guruSnapshots/analytics.controller.ts',
    'src/controllers/tagMonitoring/tagMonitoring.controller.ts',
  ]) {
    const source = read(file)
    expect(source).toContain('boundedQueryLimit')
    expect(source).toMatch(/\.limit\([^)]*boundedQueryLimit/)
    expect(source).toMatch(/\.sort\(\{[^}]*_id:/s)
  }
})

test('communication metrics aggregate without materializing full histories', () => {
  const source = read('src/models/acTags/CommunicationHistory.ts')
  const metrics = source.slice(source.indexOf('getMetricsByLevel'), source.indexOf('getAverageTimeToReturn'))
  const average = source.slice(source.indexOf('getAverageTimeToReturn'))
  expect(metrics).toContain('this.aggregate(')
  expect(metrics).not.toContain('this.find(')
  expect(average).toContain('this.aggregate(')
  expect(average).not.toContain('this.find(')
  expect(average).toContain("totalMinutes: { $sum: { $ifNull: ['$timeToReturn', 0] } }")
  expect(average).toContain('communicationCount: { $sum: 1 }')
  expect(average).not.toContain("$avg: '$timeToReturn'")
})

test('model list helpers cap requested limits at 200 with stable ordering', () => {
  const guru = read('src/models/GuruWebhook.ts')
  expect(guru.match(/boundedQueryLimit/g)).toHaveLength(3)
  expect(guru).toMatch(/sort\(\{ receivedAt: -1, _id: -1 \}\)/)
  expect(guru).toMatch(/sort\(\{ receivedAt: 1, _id: 1 \}\)/)

  const details = read('src/models/tagMonitoring/TagChangeDetail.ts')
  expect(details.match(/boundedQueryLimit/g)).toHaveLength(4)
  expect(details).toMatch(/sort\(\{ email: 1, _id: 1 \}\)/)
  expect(details).toMatch(/sort\(\{ detectedAt: -1, _id: -1 \}\)/)

  const notifications = read('src/models/tagMonitoring/TagChangeNotification.ts')
  expect(notifications.match(/boundedQueryLimit/g)).toHaveLength(4)
  expect(notifications.match(/\$switch/g)).toHaveLength(2)
  expect(notifications.match(/\{ \$limit: cappedLimit \}/g)).toHaveLength(2)
  expect(notifications).toMatch(/findByTag[\s\S]*sort\(\{ createdAt: -1, _id: -1 \}\)[\s\S]*boundedQueryLimit/)
})
