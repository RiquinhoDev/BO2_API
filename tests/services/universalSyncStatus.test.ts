import fs from 'fs'
import path from 'path'
import { buildCanonicalActiveUserStatusUpdate } from '../../src/services/syncUtilizadoresServices/universalSyncService'

describe('universal sync canonical user status', () => {
  it('updates only schema-backed status fields', () => {
    const update = buildCanonicalActiveUserStatusUpdate()

    expect(update).toEqual({
      'combined.status': 'ACTIVE',
      'hotmart.status': 'ACTIVE',
      'curseduca.memberStatus': 'ACTIVE',
    })
    expect(update).not.toHaveProperty('status')
    expect(update).not.toHaveProperty('estado')
  })

  it('keeps the Hotmart current module only in UserProduct', () => {
    const source = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'src/services/syncUtilizadoresServices/universalSync/processSyncItem.ts',
      ),
      'utf8',
    )

    expect(source).not.toContain("updateFields['hotmart.currentModule']")
    expect(source).toContain("upUpdateFields['progress.currentModule']")
    expect(source).toContain('progressObj.currentModule')
  })
})
