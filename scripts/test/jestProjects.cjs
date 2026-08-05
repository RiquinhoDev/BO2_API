const path = require('path')

/**
 * The database-backed tests are intentionally listed rather than inferred at
 * runtime. Keeping this manifest explicit makes a new MongoMemoryServer test
 * fail the topology contract instead of silently running in the unit project.
 */
const INTEGRATION_TEST_FILES = Object.freeze([
  'tests/controllers/classesStudentsByClass.controller.test.ts',
  'tests/controllers/guruSubscriptionList.controller.test.ts',
  'tests/controllers/guruWebhookList.controller.test.ts',
  'tests/controllers/userDirectory.characterization.test.ts',
  'tests/controllers/userIdentityReconciliation.controller.test.ts',
  'tests/controllers/userStatsOverview.characterization.test.ts',
  'tests/runtime/mongooseCronSeed.repository.test.ts',
  'tests/scripts/maintenance/backfillAcWebhookReceiptLeases.test.ts',
  'tests/scripts/maintenance/ensureUsersV2Indexes.test.ts',
  'tests/security/acWebhookReplayStore.test.ts',
  'tests/security/f1OfflineGuard.test.ts',
  'tests/security/mongoMemoryOffline.test.ts',
  'tests/services/analytics/mongooseBenchmarkAnalytics.reader.test.ts',
  'tests/services/analytics/mongooseClassQuickStats.reader.test.ts',
  'tests/services/analytics/mongooseGlobalAnalytics.reader.test.ts',
  'tests/services/analytics/mongooseIndividualScoreRecalculation.repository.test.ts',
  'tests/services/analytics/mongooseMultiPlatformAnalytics.reader.test.ts',
  'tests/services/cron/mongooseCronTags.repository.test.ts',
  'tests/services/users/mongooseDiscordIdentityImportHistory.repository.test.ts',
  'tests/services/users/mongooseUserIdentityReconciliation.repository.test.ts',
  'tests/services/users/mongooseUsersSimpleList.repository.test.ts',
  'tests/services/users/mongooseUsersV2Enrollment.explain.test.ts',
  'tests/services/users/mongooseUsersV2Enrollment.reader.test.ts',
  'tests/services/users/mongooseUsersV2OverviewAnalytics.reader.test.ts',
  'tests/services/users/mongooseUsersV2Stats.reader.test.ts',
])

const setupFiles = ['<rootDir>/tests/setupEnv.ts']
const setupFilesAfterEnv = ['<rootDir>/tests/setup.ts']
const testMatch = ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts']
const transform = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.jest.json' }],
}

const createSharedProject = rootDir => ({
  rootDir,
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [...testMatch],
  transform: { ...transform },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: [...setupFiles],
  setupFilesAfterEnv: [...setupFilesAfterEnv],
})

const rootTestPath = relativePath => `<rootDir>/${relativePath}`

const createJestProjects = rootDirectory => {
  const rootDir = path.resolve(rootDirectory)
  const integrationPaths = INTEGRATION_TEST_FILES.map(rootTestPath)
  const unitIgnorePatterns = [
    '<rootDir>/tests/load/',
    '<rootDir>/tests/e2e/',
    '<rootDir>/tests/sprint1/',
    ...integrationPaths,
  ]

  return [
    {
      ...createSharedProject(rootDir),
      displayName: 'unit',
      testPathIgnorePatterns: unitIgnorePatterns,
    },
    {
      ...createSharedProject(rootDir),
      displayName: 'integration',
      testMatch: integrationPaths,
      testPathIgnorePatterns: [
        '<rootDir>/tests/load/',
        '<rootDir>/tests/e2e/',
        '<rootDir>/tests/sprint1/',
      ],
    },
    {
      ...createSharedProject(rootDir),
      displayName: 'load',
      testMatch: ['<rootDir>/tests/load/**/*.test.ts'],
    },
    {
      ...createSharedProject(rootDir),
      displayName: 'e2e',
      testMatch: ['<rootDir>/tests/e2e/**/*.spec.ts'],
    },
  ]
}

module.exports = {
  INTEGRATION_TEST_FILES,
  createJestProjects,
}
