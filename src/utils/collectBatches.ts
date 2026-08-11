export async function collectBatches<T, TCursor>(
  batchSize: number,
  fetchBatch: (cursor: TCursor | undefined, batchSize: number) => Promise<T[]>,
  cursorOf: (item: T) => TCursor,
): Promise<T[]> {
  const results: T[] = []
  let cursor: TCursor | undefined

  while (true) {
    const batch = await fetchBatch(cursor, batchSize)
    results.push(...batch)

    if (batch.length < batchSize) return results
    cursor = cursorOf(batch[batch.length - 1])
  }
}