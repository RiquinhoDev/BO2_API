import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('provider read batch cap wave two wiring', () => {
  test.each([
    [
      'src/services/guru/sync/orchestration.ts',
      "assertProviderReadBatchSize(subscriptions.length, 'guru')",
    ],
    [
      'src/services/classes/hotmartClassSync.service.ts',
      "assertProviderReadBatchSize(providerUsersSeen, 'hotmart-classes')",
    ],
    [
      'src/services/classes/hotmartClassSync.service.ts',
      "assertProviderReadBatchSize(providerUsersSeen, 'hotmart-class-history')",
    ],
    [
      'src/services/classes/hotmartClassSync.service.ts',
      "assertProviderReadBatchSize(providerUsersSeen, 'hotmart-complete-sync')",
    ],
    [
      'src/services/courseLessonCatalog.service.ts',
      "assertProviderReadBatchSize(entries.length, 'hotmart-course-lessons')",
    ],
    [
      'src/services/renewal/renewalSync.service.ts',
      "assertProviderReadBatchSize(seenOffers.length, 'hotmart-renewal-offers')",
    ],
    [
      'src/controllers/guruSnapshots/history.controller.ts',
      "assertProviderReadBatchSize(allSubs.length, 'guru-snapshots-historical')",
    ],
    [
      'src/services/guru/guruTrialService.ts',
      "assertProviderReadBatchSize(expiredTrials.length, 'guru-trials-expired')",
    ],
    [
      'src/services/guru/guruInactivationMaintenance.service.ts',
      "assertProviderReadBatchSize(pending.length, 'curseduca-inactivation-cleanup')",
    ],
  ])('%s contains the expected fail-closed cap guard', (relativePath, marker) => {
    expect(source(relativePath)).toContain(marker)
  })

  test('trial expiry query only materializes one item beyond the shared ceiling', () => {
    expect(source('src/services/guru/guruTrialService.ts')).toContain(
      '.limit(MAX_PROVIDER_READ_ITEMS + 1)',
    )
  })

  test('inactivation cleanup query only materializes one item beyond the shared ceiling', () => {
    expect(source('src/services/guru/mongooseGuruInactivationMaintenance.repository.ts')).toContain(
      '.limit(MAX_PROVIDER_READ_ITEMS + 1)',
    )
  })
})
