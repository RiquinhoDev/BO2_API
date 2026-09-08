import { FmpInFlightDeduplicator } from '../../../src/services/clareza/fmpRequestDeduplicator'

describe('FmpInFlightDeduplicator', () => {
  it('shares one in-flight operation between equivalent request keys', async () => {
    let resolveOperation: ((value: string) => void) | undefined
    const operation = jest.fn(() => new Promise<string>((resolve) => {
      resolveOperation = resolve
    }))
    const deduplicator = new FmpInFlightDeduplicator()

    const first = deduplicator.run('profile:AAPL', operation)
    const second = deduplicator.run('profile:AAPL', operation)
    await Promise.resolve()
    expect(operation).toHaveBeenCalledTimes(1)
    expect(deduplicator.pendingCount).toBe(1)

    resolveOperation?.('ok')
    await expect(Promise.all([first, second])).resolves.toEqual(['ok', 'ok'])
    expect(deduplicator.pendingCount).toBe(0)
  })

  it('does not merge different request keys', async () => {
    const operation = jest.fn().mockResolvedValue('ok')
    const deduplicator = new FmpInFlightDeduplicator()

    await expect(Promise.all([
      deduplicator.run('profile:AAPL', operation),
      deduplicator.run('profile:MSFT', operation),
    ])).resolves.toEqual(['ok', 'ok'])
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('removes a rejected operation so a later request can try again', async () => {
    const error = new Error('temporary failure')
    const operation = jest.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce('recovered')
    const deduplicator = new FmpInFlightDeduplicator()

    await expect(deduplicator.run('profile:AAPL', operation)).rejects.toBe(error)
    expect(deduplicator.pendingCount).toBe(0)
    await expect(deduplicator.run('profile:AAPL', operation)).resolves.toBe('recovered')
    expect(operation).toHaveBeenCalledTimes(2)
  })
})
