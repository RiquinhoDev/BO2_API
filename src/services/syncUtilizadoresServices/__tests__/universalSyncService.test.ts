import assert from 'node:assert/strict'
import { test } from 'node:test'
import { garantirCombinedStatus } from '../universalSyncService'

test('sync de turmas cria combined.status quando o utilizador não tem combined', () => {
  const updateFields: Record<string, unknown> = {
    'combined.allClasses': [],
    'combined.primaryClass': { classId: 'c1', className: 'Turma 19 | 2610', source: 'hotmart' }
  }

  garantirCombinedStatus({}, updateFields)

  assert.equal(updateFields['combined.status'], 'ACTIVE')
})
