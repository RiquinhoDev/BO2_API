import assert from 'node:assert/strict'
import { collectCappedCursor } from '../../../../src/services/renewal/boundedMongoCursor'

function cursor(rows: number[]) {
  let closed = false
  return {
    async *[Symbol.asyncIterator]() { yield * rows },
    async close() { closed = true },
    wasClosed: () => closed,
  }
}

test('collectCappedCursor keeps all rows across driver batches', async () => {
  const source = cursor(Array.from({ length: 250 }, (_, i) => i))
  const result = await collectCappedCursor<number>(source, 20_000, 'TEST')
  assert.equal(result.length, 250)
  assert.equal(source.wasClosed(), false)
})

test('collectCappedCursor fails and closes instead of truncating overflow', async () => {
  const source = cursor([1, 2, 3])
  await assert.rejects(collectCappedCursor<number>(source, 2, 'TEST'), /TEST_CAP_EXCEEDED/)
  assert.equal(source.wasClosed(), true)
})
