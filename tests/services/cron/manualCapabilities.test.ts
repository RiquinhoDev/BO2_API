import { getCronManualCapability, cronManualFingerprintPayload } from '../../../src/services/cron/scheduler/manualCapabilities'

const job = (name: string, syncType: string = 'hotmart', id = '507f1f77bcf86cd799439011') => ({
  _id: { toString: () => id },
  name,
  syncType,
  syncConfig: { fullSync: true, includeProgress: true, includeTags: false, batchSize: 50 },
  tagRules: [],
  tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
  __v: 3,
})

describe('manual cron capabilities', () => {
  test.each([
    ['DailyPipeline', 'pipeline', 'daily-pipeline', 'implemented'],
    ['DiscordScheduledMessages', 'discord', 'discord-scheduled-messages', 'implemented'],
    ['StandardSync', 'hotmart', 'unsupported', 'blocked'],
  ] as const)('%s/%s resolves to %s', (name, syncType, capability, status) => {
    const result = getCronManualCapability(job(name, syncType))
    expect(result.id).toBe(capability)
    expect(result.status).toBe(status)
  })

  test('fingerprint payload includes immutable job identity and execution config', () => {
    expect(cronManualFingerprintPayload(job('DiscordScheduledMessages', 'discord'))).toEqual({
      entryPoint: 'cron-job-trigger',
      resultContract: 'cron-execution',
      capability: 'discord-scheduled-messages',
      jobId: '507f1f77bcf86cd799439011',
      jobName: 'DiscordScheduledMessages',
      syncType: 'discord',
      version: 3,
      syncConfig: { fullSync: true, includeProgress: true, includeTags: false, batchSize: 50 },
      tagRules: [],
      tagRuleOptions: { enabled: false, executeAllRules: false, runInParallel: false, stopOnError: false },
    })
  })
})
