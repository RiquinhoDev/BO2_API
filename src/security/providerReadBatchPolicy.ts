export const MAX_PROVIDER_READ_ITEMS = 20_000

export function assertProviderReadBatchSize(
  count: number,
  provider: string,
): void {
  if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
    throw new Error(`PROVIDER_READ_BATCH_INVALID_COUNT:${provider}`)
  }

  if (count > MAX_PROVIDER_READ_ITEMS) {
    throw new Error(
      `PROVIDER_READ_BATCH_LIMIT_EXCEEDED:${provider}:${count}:${MAX_PROVIDER_READ_ITEMS}`,
    )
  }
}
