import { getOps02Decision } from '../../src/security/ops02Policy'

const discordMessageRoutes = [
  {
    path: '/api/discord-renewal/messages/send',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: {
      status: 'verified',
      reason: 'discord-message-durable-receipt-and-provider-audit-fence',
    },
    killSwitch: { status: 'verified', reason: 'DISCORD_MESSAGES_ENABLED' },
    dryRun: { status: 'verified', reason: 'POST /api/discord-renewal/messages/preview' },
  },
  {
    path: '/api/discord-renewal/scheduled/:key/test',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: {
      status: 'verified',
      reason: 'discord-message-durable-receipt-and-provider-audit-fence',
    },
    killSwitch: { status: 'verified', reason: 'DISCORD_MESSAGES_ENABLED' },
    dryRun: { status: 'verified', reason: 'GET /api/discord-renewal/scheduled/:key/preview' },
  },
  {
    path: '/api/discord-renewal/scheduled/run',
    cap: { status: 'verified', reason: 'scheduled-rule-query-cap', limit: 50 },
    idempotency: {
      status: 'verified',
      reason: 'scheduled-rule-month-receipt-and-run-receipt-fence',
    },
    killSwitch: { status: 'verified', reason: 'DISCORD_SCHEDULED_MESSAGES_ENABLED+DISCORD_MESSAGES_ENABLED' },
    dryRun: {
      status: 'verified',
      reason: 'scheduled-run-dry-run-no-provider-or-local-mutation',
    },
  },
] as const

describe('OPS-02 Discord message protection inventory', () => {
  test.each(discordMessageRoutes)('$path keeps exact reviewed protection reasons', (route) => {
    const decision = getOps02Decision('POST', route.path)
    expect(decision).not.toBeNull()
    expect(decision?.cap).toEqual(route.cap)
    expect(decision?.idempotency).toEqual(route.idempotency)
    expect(decision?.killSwitch).toEqual(route.killSwitch)
    expect(decision?.dryRun).toEqual(route.dryRun)
    expect(decision?.status).toBe('reviewed')
  })
})
