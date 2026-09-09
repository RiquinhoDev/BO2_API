import mongoose from 'mongoose'
import { infrastructure } from '../../src/runtime/infrastructure'
import { cacheService } from '../../src/services/cache.service'
import type { AppConfig } from '../../src/config/appConfig'

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

test('read-only infrastructure disables Mongo DDL and refuses writable credentials before Redis', async () => {
  const config = { readOnlyMode: true, mongoUri: 'mongodb://database.internal/bo2' } as AppConfig
  const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose)
  const cacheConnect = jest.spyOn(cacheService, 'connect')
  const db = Object.getOwnPropertyDescriptor(mongoose.connection, 'db')
  const command = jest.fn().mockResolvedValue({ authInfo: { authenticatedUsers: [{ user: 'writer' }], authenticatedUserPrivileges: [{ actions: ['find', 'insert'] }] } })
  Object.defineProperty(mongoose.connection, 'db', { configurable: true, value: { admin: () => ({ command }) } })
  try {
    await expect(infrastructure.connectMongo(config)).rejects.toThrow('READ_ONLY_MONGO_CREDENTIALS_REQUIRED')
    expect(connect).toHaveBeenCalledWith(config.mongoUri, { autoCreate: false, autoIndex: false })
    expect(command).toHaveBeenCalledWith({ connectionStatus: 1, showPrivileges: true })
    await expect(infrastructure.connectRedis(config)).resolves.toBeUndefined()
    expect(cacheConnect).not.toHaveBeenCalled()
  } finally {
    if (db) Object.defineProperty(mongoose.connection, 'db', db)
    else Reflect.deleteProperty(mongoose.connection, 'db')
    connect.mockRestore()
    cacheConnect.mockRestore()
  }
})
