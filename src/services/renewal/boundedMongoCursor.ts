export interface ClosableAsyncCursor<T> extends AsyncIterable<T> {
  close?: () => Promise<unknown>
}

export async function collectCappedCursor<T>(
  cursor: ClosableAsyncCursor<T>,
  cap: number,
  errorCode: string,
): Promise<T[]> {
  const rows: T[] = []
  for await (const row of cursor) {
    rows.push(row)
    if (rows.length > cap) {
      await cursor.close?.()
      throw new Error(`${errorCode}_CAP_EXCEEDED`)
    }
  }
  return rows
}
