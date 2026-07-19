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
})
