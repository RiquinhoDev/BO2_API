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

test.each([
  ['mongodb+srv://reader:placeholder@cluster0.otcx5ho.mongodb.net/teste', 'teste', 'test', true],
  ['mongodb+srv://reader:placeholder@cluster0.otcx5ho.mongodb.net/riquinho', 'riquinho', 'test', false],
  ['mongodb+srv://reader:placeholder@clusterriquinho.djt0j.mongodb.net/teste', 'teste', 'test', false],
  ['mongodb+srv://reader:placeholder@cluster0.otcx5ho.mongodb.net/teste', 'test', 'test', false],
  ['mongodb+srv://reader:placeholder@cluster0.otcx5ho.mongodb.net/teste', 'teste', 'production', false],
])('isolated admin exception is restricted to the exact test destination (%s, %s, %s)', async (mongoUri, databaseName, nodeEnv, accepted) => {
  const config = { readOnlyMode: true, mongoUri, nodeEnv } as AppConfig
  const connect = jest.spyOn(mongoose, 'connect').mockResolvedValue(mongoose)
  const previousDb = Object.getOwnPropertyDescriptor(mongoose.connection, 'db')
  const command = jest.fn().mockResolvedValue({ authInfo: { authenticatedUsers: [{}], authenticatedUserPrivileges: [{ actions: ['find', 'insert'] }] } })
  Object.defineProperty(mongoose.connection, 'db', { configurable: true, value: { databaseName, admin: () => ({ command }) } })
  try {
    if (accepted) {
      await expect(infrastructure.connectMongo(config)).resolves.toBeUndefined()
      expect(command).not.toHaveBeenCalled()
    } else {
      await expect(infrastructure.connectMongo(config)).rejects.toThrow('READ_ONLY_MONGO_CREDENTIALS_REQUIRED')
    }
    expect(connect).toHaveBeenCalledWith(mongoUri, { autoCreate: false, autoIndex: false })
  } finally {
    if (previousDb) Object.defineProperty(mongoose.connection, 'db', previousDb)
    else Reflect.deleteProperty(mongoose.connection, 'db')
    connect.mockRestore()
  }
})
