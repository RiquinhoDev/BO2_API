import assert from 'node:assert/strict'
import { test } from 'node:test'
import AcWriteLog from '../AcWriteLog'
import AcPurchaseDateEventState from '../AcPurchaseDateEventState'

test('AcWriteLog exige o contrato do rasto e indexa email e quando', () => {
  const campos = AcWriteLog.schema.paths
  assert.equal(campos.quando.options.required, true)
  assert.equal(campos.servico.options.required, true)
  assert.deepEqual(campos.servico.options.enum, ['expiracao', 'dataCompra'])
  assert.equal(campos.email.options.required, true)
  assert.equal(campos.campo.options.required, true)
  assert.equal(campos.antes.options.default, null)
  assert.equal(campos.depois.options.default, null)
  assert.deepEqual(campos.accao.options.enum, ['escrito', 'recusado'])
  assert.equal(campos.dryRun.options.required, true)
  assert.equal(campos.idempotencyKey.options.required, true)

  const indices = AcWriteLog.schema.indexes().map(([camposIndice]) => camposIndice)
  assert.equal(indices.some((indice) => indice.email === 1), true)
  assert.equal(indices.some((indice) => indice.quando === 1), true)
  assert.equal(indices.some((indice) => indice.idempotencyKey === 1), true)
  assert.equal(
    AcWriteLog.schema.indexes().some(([indice, opcoes]) => indice.idempotencyKey === 1 && opcoes.unique === true),
    true
  )
})

test('estado do 334 guarda claim com token, lease e evento por aluno', () => {
  const campos = AcPurchaseDateEventState.schema.paths
  assert.deepEqual(campos.status.options.enum, ['livre', 'tratado', 'claimado', 'confirmacao-pendente'])
  assert.equal(campos.claimToken.options.default, null)
  assert.equal(campos.leaseUntil.options.default, null)
  assert.equal(campos.pendingEventIdentity.options.default, null)
  assert.equal(
    AcPurchaseDateEventState.schema.indexes().some(([indice, opcoes]) => indice.userId === 1 && opcoes.unique === true),
    true
  )
})
