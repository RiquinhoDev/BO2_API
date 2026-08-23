import assert from 'node:assert/strict'
import { test } from 'node:test'
import AcWriteLog from '../AcWriteLog'

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

  const indices = AcWriteLog.schema.indexes().map(([camposIndice]) => camposIndice)
  assert.equal(indices.some((indice) => indice.email === 1), true)
  assert.equal(indices.some((indice) => indice.quando === 1), true)
})
