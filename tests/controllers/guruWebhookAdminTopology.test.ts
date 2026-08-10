import { debugToken, migrateWebhookSource } from '../../src/controllers/guruWebhookAdmin.controller'
import * as legacyController from '../../src/controllers/guru.webhook.controller'

describe('Guru webhook admin controller topology', () => {
  it('keeps legacy exports wired to the focused admin handlers', () => {
    expect(legacyController.debugToken).toBe(debugToken)
    expect(legacyController.migrateWebhookSource).toBe(migrateWebhookSource)
  })
})
