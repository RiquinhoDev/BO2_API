const { createJestProjects } = require('./scripts/test/jestProjects.cjs')

module.exports = {
  rootDir: __dirname,
  projects: createJestProjects(__dirname),
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 30000,
  verbose: true,
}

