import { getOps02Decision } from '../../src/security/ops02Policy'

const discordMessageRoutes = [
  {
    path: '/api/discord-renewal/messages/send',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: { status: 'required', reason: 'manual-message-no-idempotency-key' },
    killSwitch: { status: 'verified', reason: 'DISCORD_MESSAGES_ENABLED' },
    dryRun: { status: 'verified', reason: 'POST /api/discord-renewal/messages/preview' },
  },
  {
    path: '/api/discord-renewal/scheduled/:key/test',
    cap: { status: 'not-applicable', reason: 'not-caller-bulk' },
    idempotency: { status: 'required', reason: 'scheduled-test-no-idempotency-key' },
    killSwitch: { status: 'verified', reason: 'DISCORD_MESSAGES_ENABLED' },
    dryRun: { status: 'verified', reason: 'GET /api/discord-renewal/scheduled/:key/preview' },
  },
  {
    path: '/api/discord-renewal/scheduled/run',
    cap: { status: 'required', reason: 'scheduled-rule-count-no-finite-cap' },
    idempotency: { status: 'required', reason: 'lastSentMonth-check-save-not-atomic' },
    killSwitch: { status: 'verified', reason: 'DISCORD_SCHEDULED_MESSAGES_ENABLED+DISCORD_MESSAGES_ENABLED' },
    dryRun: { status: 'required', reason: 'scheduled-run-no-complete-dry-run' },
  },
] as const

describe('OPS-02 Discord message gap inventory', () => {
  test.each(discordMessageRoutes)('$path keeps exact unresolved protection reasons', (route) => {
    const decision = getOps02Decision('POST', route.path)
    expect(decision).not.toBeNull()
    expect(decision?.cap).toEqual(route.cap)
    expect(decision?.idempotency).toEqual(route.idempotency)
    expect(decision?.killSwitch).toEqual(route.killSwitch)
    expect(decision?.dryRun).toEqual(route.dryRun)
    expect(decision?.status).toBe('needs-hardening')
  })
})
