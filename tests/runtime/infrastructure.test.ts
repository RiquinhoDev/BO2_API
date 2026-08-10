import mongoose from 'mongoose'
import { infrastructure } from '../../src/runtime/infrastructure'
import { cacheService } from '../../src/services/cache.service'

test('infrastructure disconnect always attempts both resources and exposes cleanup failures', async () => {
  const cacheError = new Error('cache disconnect failed')
  const mongoError = new Error('mongo disconnect failed')
  const cacheDisconnect = jest.spyOn(cacheService, 'disconnect').mockRejectedValue(cacheError)
  const mongoDisconnect = jest.spyOn(mongoose, 'disconnect').mockRejectedValue(mongoError)

  try {
    let cleanupError: unknown
    try {
      await infrastructure.disconnect()
    } catch (error) {
      cleanupError = error
    }

    expect(cleanupError).toBeInstanceOf(Error)
    expect((cleanupError as Error & { errors: readonly unknown[] }).name).toBe('InfrastructureCleanupError')
    expect((cleanupError as Error & { errors: readonly unknown[] }).errors).toEqual([cacheError, mongoError])
    expect(cacheDisconnect).toHaveBeenCalledTimes(1)
    expect(mongoDisconnect).toHaveBeenCalledTimes(1)
  } finally {
    cacheDisconnect.mockRestore()
    mongoDisconnect.mockRestore()
  }
})
