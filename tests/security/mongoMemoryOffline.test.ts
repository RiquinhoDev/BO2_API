import path from 'path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import { assertSafeTestMongoUri } from '../../src/config/testDatabase'

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
