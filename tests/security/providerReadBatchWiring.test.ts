import fs from 'node:fs'
import path from 'node:path'

function source(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

describe('provider read batch cap wiring', () => {
  test.each([
    [
      'src/services/syncUtilizadoresServices/hotmartServices/hotmart.adapter.ts',
      "assertProviderReadBatchSize(rawUsers.length, 'hotmart')",
    ],
    [
      'src/services/syncUtilizadoresServices/curseducaServices/curseducaBulkSync.adapter.ts',
      "assertProviderReadBatchSize(normalized.length, 'curseduca')",
    ],
    [
      'src/controllers/hotmart/hotmartUniversalSync.controller.ts',
      "assertProviderReadBatchSize(existingUsers.length, 'hotmart-progress')",
    ],
    [
      'src/services/hotmart/hotmartProgressSync.service.ts',
      "assertProviderReadBatchSize(existingUsers.length, 'hotmart-progress')",
    ],
  ])('%s enforces the shared cap before local write fan-out', (relativePath, marker) => {
    expect(source(relativePath)).toContain(marker)
  })
})
