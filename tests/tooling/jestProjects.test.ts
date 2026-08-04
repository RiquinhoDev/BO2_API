import fs from 'fs'
import path from 'path'

import packageJson from '../../package.json'

// This import is intentionally the contract under construction. The RED run
// must fail until the shared project factory exists.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createJestProjects, INTEGRATION_TEST_FILES } = require('../../scripts/test/jestProjects.cjs') as {
  createJestProjects: (rootDir: string) => JestProject[]
  INTEGRATION_TEST_FILES: readonly string[]
}

type JestProject = {
  displayName: string
  rootDir: string
  testMatch?: string[]
  testPathIgnorePatterns?: string[]
  setupFiles?: string[]
  setupFilesAfterEnv?: string[]
  transform?: Record<string, unknown>
}

const repositoryRoot = path.resolve(__dirname, '../..')
const testsRoot = path.join(repositoryRoot, 'tests')
const toPosix = (value: string): string => value.replace(/\\/g, '/')
const relativeTestPath = (absolutePath: string): string =>
  toPosix(path.relative(repositoryRoot, absolutePath))

const listTestFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const absolutePath = path.join(directory, entry.name)

    if (entry.isDirectory()) return listTestFiles(absolutePath)
    if (!entry.isFile() || !/\.(?:test|spec)\.ts$/.test(entry.name)) return []

    return [relativeTestPath(absolutePath)]
  })

const scanMongoTests = (): string[] => {
  const markers = [
    ['Mongo', 'MemoryServer'].join(''),
    ['mongodb', '-memory-server'].join(''),
    ['connect', 'TestDatabase'].join(''),
    ['test', 'Database'].join(''),
  ]

  return listTestFiles(testsRoot)
    .filter(relativePath => {
      const source = fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8')
      return !relativePath.startsWith('tests/sprint1/') && markers.some(marker => source.includes(marker))
    })
    .sort()
}

const projectByName = (projects: JestProject[], name: string): JestProject => {
  const project = projects.find(candidate => candidate.displayName === name)
  if (!project) throw new Error(`Missing Jest project: ${name}`)
  return project
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('Jest project topology', () => {
  const projects = createJestProjects(repositoryRoot)
  const unit = projectByName(projects, 'unit')
  const integration = projectByName(projects, 'integration')
  const load = projectByName(projects, 'load')
  const e2e = projectByName(projects, 'e2e')

  it('exposes the four isolated display names', () => {
    expect(projects.map(project => project.displayName)).toEqual([
      'unit',
      'integration',
      'load',
      'e2e',
    ])
  })

  it('inherits the offline setup and ts-jest transform in every project', () => {
    for (const project of projects) {
      expect(project.rootDir).toBe(repositoryRoot)
      expect(project.setupFiles).toEqual(['<rootDir>/tests/setupEnv.ts'])
      expect(project.setupFilesAfterEnv).toEqual(['<rootDir>/tests/setup.ts'])
      expect(project.transform).toEqual({
        '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
      })
    }
  })

  it('registers exact offline scripts with unit plus integration as the default', () => {
    expect(packageJson.scripts).toMatchObject({
      test: 'jest --selectProjects unit integration',
      'test:unit': 'jest --selectProjects unit',
      'test:integration': 'jest --selectProjects integration',
      'test:load': 'jest --selectProjects load',
      'test:e2e': 'jest --selectProjects e2e',
    })
  })

  it('keeps the scanned database manifest explicit and classifies each test once', () => {
    expect([...INTEGRATION_TEST_FILES].sort()).toEqual(scanMongoTests())

    const rootPattern = toPosix(repositoryRoot)
    const asRootPattern = (relativePath: string): string =>
      `<rootDir>/${relativePath}`

    expect(integration.testMatch).toEqual(
      INTEGRATION_TEST_FILES.map(relativePath => asRootPattern(relativePath)),
    )
    expect(load.testMatch).toEqual(['<rootDir>/tests/load/**/*.test.ts'])
    expect(e2e.testMatch).toEqual(['<rootDir>/tests/e2e/**/*.spec.ts'])
    expect(unit.testPathIgnorePatterns).toEqual(
      expect.arrayContaining([
        '<rootDir>/tests/load/',
        '<rootDir>/tests/e2e/',
        '<rootDir>/tests/sprint1/',
      ]),
    )

    const ignoredByUnit = (relativePath: string): boolean => {
      const absolutePath = toPosix(path.join(repositoryRoot, relativePath))
      return (unit.testPathIgnorePatterns ?? []).some(pattern => {
        const resolvedPattern = pattern.replace(
          '<rootDir>',
          escapeRegExp(rootPattern),
        )
        return new RegExp(resolvedPattern).test(absolutePath)
      })
    }

    const discovered = listTestFiles(testsRoot).sort()
    const expected = discovered.filter(relativePath => !relativePath.startsWith('tests/sprint1/'))
    const owners = new Map<string, string[]>()

    for (const relativePath of discovered) {
      const ownerNames: string[] = []
      const integrationMatch = (integration.testMatch ?? []).includes(asRootPattern(relativePath))
      const loadMatch = relativePath.startsWith('tests/load/')
      const e2eMatch = relativePath.startsWith('tests/e2e/')
      const unitMatch = !ignoredByUnit(relativePath)

      if (integrationMatch) ownerNames.push('integration')
      if (loadMatch) ownerNames.push('load')
      if (e2eMatch) ownerNames.push('e2e')
      if (unitMatch) ownerNames.push('unit')
      owners.set(relativePath, ownerNames)
    }

    expect(discovered.filter(relativePath => (owners.get(relativePath) ?? []).length !== 1)).toEqual([
      'tests/sprint1/architecture.test.ts',
    ])
    expect(discovered.filter(relativePath => (owners.get(relativePath) ?? []).length === 1)).toEqual(
      expected,
    )
  })
})
