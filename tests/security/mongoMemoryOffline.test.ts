import path from 'path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'
import { MongoClient } from 'mongodb'
import { assertReadOnlyMongoPrivileges } from '../../src/security/readOnlyMode'

test('arranca MongoMemoryServer offline a partir da cache externa', async () => {
  expect(process.env.MONGOMS_RUNTIME_DOWNLOAD).toBe('false')
  expect(path.normalize(process.env.MONGOMS_DOWNLOAD_DIR ?? '')).not.toContain(
    path.normalize('node_modules'),
  )

  const server = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'bo2_memory_test' },
  })

  try {
    const uri = assertSafeTestMongoUri(server.getUri('bo2_memory_test'))
    await mongoose.connect(uri)
    expect(mongoose.connection.readyState).toBe(1)
  } finally {
    await mongoose.disconnect()
    await server.stop()
  }

  expect(mongoose.connection.readyState).toBe(0)
})

test('Mongo read credentials permit reads and reject writes on an authenticated local server', async () => {
  const server = await MongoMemoryServer.create({
    binary: { version: '8.2.6' },
    instance: { dbName: 'readonly_test' },
    auth: {
      enable: true, customRootName: 'offline-root', customRootPwd: 'offline-root-secret',
      extraUsers: [{ createUser: 'offline-reader', pwd: 'offline-reader-secret', database: 'readonly_test', roles: [{ role: 'read', db: 'readonly_test' }] }],
    },
  })
  const uri = assertSafeTestMongoUri(server.getUri('readonly_test'))
  const root = new MongoClient(uri, { auth: { username: 'offline-root', password: 'offline-root-secret' }, authSource: 'admin' })
  const reader = new MongoClient(uri, { auth: { username: 'offline-reader', password: 'offline-reader-secret' }, authSource: 'readonly_test' })
  try {
    await root.connect()
    await root.db().collection('examples').insertOne({ label: 'synthetic' })
    await reader.connect()
    assertReadOnlyMongoPrivileges(await reader.db().admin().command({ connectionStatus: 1, showPrivileges: true }))
    expect(await reader.db().collection('examples').countDocuments()).toBe(1)
    await expect(reader.db().collection('examples').insertOne({ label: 'blocked' })).rejects.toMatchObject({ code: 13 })
    expect(() => assertReadOnlyMongoPrivileges({ authInfo: { authenticatedUsers: [{ user: 'root' }], authenticatedUserPrivileges: [{ actions: ['anyAction'] }] } })).toThrow('READ_ONLY_MONGO_CREDENTIALS_REQUIRED')
  } finally {
    await reader.close()
    await root.close()
    await server.stop()
  }
}, 60000)
