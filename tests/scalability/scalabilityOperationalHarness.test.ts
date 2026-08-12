import {
  runOperationalValidation,
  type OperationalCommand,
} from '../../scripts/validate-scalability-operational'

const authorizedEnv = {
  SCALABILITY_OPERATIONAL_ALLOW_READ_ONLY: 'true',
  SCALABILITY_OPERATIONAL_TARGET_KIND: 'synthetic',
  SCALABILITY_OPERATIONAL_TARGET_NAME: 'local-read-only-fixture',
}

describe('read-only scalability operational harness', () => {
  it('fails closed when explicit read-only authorization is absent', async () => {
    await expect(runOperationalValidation({ env: {} })).rejects.toThrow(
      'explicit read-only authorization is required',
    )
  })

  it.each([
    ['production-looking name', { ...authorizedEnv, SCALABILITY_OPERATIONAL_TARGET_NAME: 'prod-primary' }],
    ['write-capable authorization', { ...authorizedEnv, SCALABILITY_OPERATIONAL_ALLOW_WRITES: 'true' }],
  ])('rejects %s', async (_name, env) => {
    await expect(runOperationalValidation({ env })).rejects.toThrow(
      /read-only target|write capability/i,
    )
  })

  it('rejects commands outside the read-only allowlist', async () => {
    const command = { kind: 'deleteMany', identity: 'users' } as unknown as OperationalCommand
    await expect(runOperationalValidation({ env: authorizedEnv, commands: [command] }))
      .rejects.toThrow('command is not in the read-only allowlist')
  })

  it('sanitizes secret-bearing executor output and asserts zero writes', async () => {
    const evidence = await runOperationalValidation({
      env: authorizedEnv,
      commands: [{ kind: 'syntheticRead', identity: 'users-v2-list', concurrency: 10 }],
      execute: async () => ({
        latenciesMs: [1, 2, 3],
        writes: 0,
        executionStats: { nReturned: 3, totalDocsExamined: 3, totalKeysExamined: 3 },
        metadata: { authorization: 'Bearer top-secret', uri: 'mongodb://user:pass@host/db' },
      }),
    })

    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain('top-secret')
    expect(serialized).not.toContain('user:pass')
    expect(serialized).not.toContain('mongodb://')
    expect(evidence.results[0]).toMatchObject({
      identity: 'users-v2-list',
      concurrency: 10,
      writes: 0,
      latencyMs: { p50: 2, p95: 3, p99: 3 },
    })
  })

  it('rejects any observed write', async () => {
    await expect(runOperationalValidation({
      env: authorizedEnv,
      execute: async () => ({ latenciesMs: [1], writes: 1 }),
    })).rejects.toThrow('zero-write assertion failed')
  })

  it('times out a stalled probe', async () => {
    await expect(runOperationalValidation({
      env: { ...authorizedEnv, SCALABILITY_OPERATIONAL_TIMEOUT_MS: '10' },
      execute: async () => new Promise(() => undefined),
    })).rejects.toThrow('probe timed out')
  })
})
