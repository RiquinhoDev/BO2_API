"use strict";
// =====================================================
// 📁 tests/setup.ts
// Setup inicial para todos os testes
// =====================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const mongodb_memory_server_1 = require("mongodb-memory-server");
let mongoServer;
// Conectar BD de teste antes de todos os testes
beforeAll(async () => {
    mongoServer = await mongodb_memory_server_1.MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    await mongoose_1.default.connect(mongoUri);
    console.log('✅ MongoDB de teste conectado');
});
// Limpar BD entre cada teste
afterEach(async () => {
    const collections = mongoose_1.default.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
});
// Desconectar após todos os testes
afterAll(async () => {
    await mongoose_1.default.disconnect();
    await mongoServer.stop();
    console.log('✅ MongoDB de teste desconectado');
});
// Timeout global para testes
jest.setTimeout(30000);
