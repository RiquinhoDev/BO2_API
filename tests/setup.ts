// =====================================================
// 📁 tests/setup.ts
// Setup inicial para todos os testes
// =====================================================

import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongoServer: MongoMemoryServer

// Conectar BD de teste antes de todos os testes
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
  const mongoUri = mongoServer.getUri()
  await mongoose.connect(mongoUri)
  console.log('✅ MongoDB de teste conectado')
})

// Limpar BD entre cada teste
afterEach(async () => {
  const collections = mongoose.connection.collections
  for (const key in collections) {
    await collections[key].deleteMany({})
  }
})

// Desconectar após todos os testes
afterAll(async () => {
  await mongoose.disconnect()
  await mongoServer.stop()
  console.log('✅ MongoDB de teste desconectado')
})

// Timeout global para testes
jest.setTimeout(30000)

