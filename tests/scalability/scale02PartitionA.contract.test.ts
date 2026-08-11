import fs from 'node:fs'
import path from 'node:path'

const read = (relativePath: string): string =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('SCALE-02 partition A set-based query contracts', () => {
  const dashboardQuick = read('src/controllers/dashboardQuick.controller.ts')
  const dashboard = read('src/controllers/dashboard.controller.ts')
  const engagementSummary = read('src/controllers/engagement/summary.controller.ts')
  const engagementStats = read('src/controllers/engagement/stats.controller.ts')
  const cohorts = read('src/services/analytics/cohortAnalytics.service.ts')
  const userBehavior = read('src/models/user.behavior.ts')

  test('keeps complete global aggregates and enables bounded aggregation memory', () => {
    expect(dashboardQuick.slice(0, dashboardQuick.indexOf('export const getEngagementHeatmap'))).not.toContain('.limit(')
    expect(dashboard.slice(0, dashboard.indexOf('export const getProductsBreakdown'))).not.toContain('.limit(')
    expect(dashboardQuick.match(/allowDiskUse: true/g)).toHaveLength(2)
    expect(dashboard.match(/allowDiskUse: true/g)).toHaveLength(3)
    expect(engagementSummary.match(/\.allowDiskUse\(true\)/g)).toHaveLength(1)
    expect(engagementStats.match(/allowDiskUse: true/g)).toHaveLength(1)
    expect(cohorts.match(/\.allowDiskUse\(true\)/g)).toHaveLength(2)
    expect(userBehavior.match(/\.allowDiskUse\(true\)/g)).toHaveLength(2)
  })

  test('compares two products with one set-based query, independent of fixture size', () => {
    const method = dashboard.slice(
      dashboard.indexOf('export const compareProducts'),
      dashboard.indexOf('export const getDashboardStatsV3'),
    )
    expect(method.match(/UserProduct\.aggregate\(/g)).toHaveLength(1)
    expect(method).not.toContain('Product.findById')
    expect(method).not.toContain('getProductStats')
    expect(method).toContain('$in: productIds')
  })

  test('computes any number of cohort months in one aggregate', () => {
    const retention = cohorts.slice(
      cohorts.indexOf('async calculateCohortRetention'),
      cohorts.indexOf('async calculateCohortMetrics'),
    )
    expect(retention.match(/UserProduct\.aggregate\(/g)).toHaveLength(1)
    expect(retention).not.toContain('countDocuments')
    expect(retention).not.toContain('while (')
  })

  test('folds engagement platform counters into the main aggregate', () => {
    expect(engagementStats.match(/User\.aggregate\(/g)).toHaveLength(1)
    expect(engagementStats).not.toContain('User.countDocuments')
  })

  test('computes both user data sources in one facet aggregate', () => {
    const method = userBehavior.slice(
      userBehavior.indexOf('schema.statics.getDataSourceStats'),
      userBehavior.indexOf('schema.statics.getEnhancedUsersList'),
    )
    expect(method.match(/this\.aggregate\(/g)).toHaveLength(1)
    expect(method).toContain('$facet')
  })

  test('applies dashboard filters before the optional user lookup', () => {
    const method = dashboard.slice(
      dashboard.indexOf('export const getDashboardStats'),
      dashboard.indexOf('export const getProductsBreakdown'),
    )
    expect(method.indexOf('pipeline: any[] = [{ $match: matchStage }]'))
      .toBeLessThan(method.indexOf('$lookup'))
    expect(method).not.toContain('pipeline.unshift')
  })
})
