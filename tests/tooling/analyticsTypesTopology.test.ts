import fs from 'node:fs'
import path from 'node:path'

const typesDir = path.resolve(__dirname, '../../src/types')

describe('analytics type topology', () => {
  it('keeps the legacy module as a small compatibility barrel', () => {
    const barrel = fs.readFileSync(path.join(typesDir, 'analytics.types.ts'), 'utf8')

    expect(barrel.split(/\r?\n/)).toHaveLength(7)
    expect(barrel).toContain("export type * from './analytics/core.types'")
    expect(barrel).toContain("export type * from './analytics/classAnalytics.types'")
  })

  it('stores cohesive contracts in type-only modules below the production limit', () => {
    const modules = fs
      .readdirSync(path.join(typesDir, 'analytics'))
      .filter(file => file.endsWith('.types.ts'))

    expect(modules).toEqual([
      'api.types.ts',
      'classAnalytics.types.ts',
      'cohort.types.ts',
      'core.types.ts',
      'dashboard.types.ts',
      'presentation.types.ts'
    ])

    for (const module of modules) {
      const source = fs.readFileSync(path.join(typesDir, 'analytics', module), 'utf8')
      expect(source.split(/\r?\n/).length).toBeLessThanOrEqual(500)
      expect(source).not.toMatch(/^export (?:const|let|var|function|class|enum)\b/m)
    }
  })
})

