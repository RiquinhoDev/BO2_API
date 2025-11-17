"use strict";
// tests/integration/products-v2.test.ts
// 🧪 Sprint 4: Integration Tests for Products API V2
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
const supertest_1 = __importDefault(require("supertest"));
const mongoose_1 = __importDefault(require("mongoose"));
const Product_1 = __importDefault(require("../../src/models/Product"));
const UserProduct_1 = __importDefault(require("../../src/models/UserProduct"));
const User_1 = __importDefault(require("../../src/models/User"));
// Import app (assumindo que existe um export em src/app.ts)
// Se não existir, ajustar para o export correto
let app;
(0, globals_1.describe)('Products API V2 - Integration Tests', () => {
    let testProductId;
    let testUserId;
    (0, globals_1.beforeAll)(async () => {
        // Conectar ao MongoDB de teste
        const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/test-db';
        await mongoose_1.default.connect(mongoUri);
        // Importar app depois da conexão
        app = (await Promise.resolve().then(() => __importStar(require('../../src/app')))).default;
    });
    (0, globals_1.afterAll)(async () => {
        // Limpar database de teste
        await Product_1.default.deleteMany({});
        await UserProduct_1.default.deleteMany({});
        await User_1.default.deleteMany({});
        // Desconectar
        await mongoose_1.default.disconnect();
    });
    (0, globals_1.beforeEach)(async () => {
        // Limpar coleções antes de cada teste
        await Product_1.default.deleteMany({});
        await UserProduct_1.default.deleteMany({});
    });
    (0, globals_1.describe)('GET /api/products', () => {
        (0, globals_1.it)('deve retornar todos os produtos V2', async () => {
            // Criar produtos de teste
            await Product_1.default.create([
                {
                    code: 'TEST-OGI',
                    name: 'Test OGI Product',
                    platform: 'hotmart',
                    courseId: new mongoose_1.default.Types.ObjectId(),
                    settings: {
                        allowMultipleEnrollments: false,
                        requiresApproval: false,
                    },
                    features: {
                        hasClasses: true,
                        hasProgress: true,
                        hasEngagement: true,
                        hasReports: true,
                    },
                    isActive: true,
                },
                {
                    code: 'TEST-CLAREZA',
                    name: 'Test Clareza Product',
                    platform: 'curseduca',
                    courseId: new mongoose_1.default.Types.ObjectId(),
                    settings: {
                        allowMultipleEnrollments: false,
                        requiresApproval: false,
                    },
                    features: {
                        hasClasses: true,
                        hasProgress: true,
                        hasEngagement: true,
                        hasReports: true,
                    },
                    isActive: true,
                },
            ]);
            const response = await (0, supertest_1.default)(app)
                .get('/api/products')
                .expect(200);
            (0, globals_1.expect)(response.body.success).toBe(true);
            (0, globals_1.expect)(Array.isArray(response.body.products)).toBe(true);
            (0, globals_1.expect)(response.body.products.length).toBeGreaterThanOrEqual(2);
            // Verificar estrutura V2
            const product = response.body.products[0];
            (0, globals_1.expect)(product).toHaveProperty('_id');
            (0, globals_1.expect)(product).toHaveProperty('code');
            (0, globals_1.expect)(product).toHaveProperty('name');
            (0, globals_1.expect)(product).toHaveProperty('platform');
            (0, globals_1.expect)(product).toHaveProperty('settings');
            (0, globals_1.expect)(product).toHaveProperty('features');
        });
        (0, globals_1.it)('deve filtrar produtos por plataforma', async () => {
            // Criar produtos de diferentes plataformas
            await Product_1.default.create([
                {
                    code: 'HOTMART-1',
                    name: 'Hotmart Product',
                    platform: 'hotmart',
                    courseId: new mongoose_1.default.Types.ObjectId(),
                    settings: { allowMultipleEnrollments: false, requiresApproval: false },
                    features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                    isActive: true,
                },
                {
                    code: 'CURSEDUCA-1',
                    name: 'CursEduca Product',
                    platform: 'curseduca',
                    courseId: new mongoose_1.default.Types.ObjectId(),
                    settings: { allowMultipleEnrollments: false, requiresApproval: false },
                    features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                    isActive: true,
                },
            ]);
            const response = await (0, supertest_1.default)(app)
                .get('/api/products?platform=hotmart')
                .expect(200);
            (0, globals_1.expect)(response.body.products.length).toBe(1);
            (0, globals_1.expect)(response.body.products[0].platform).toBe('hotmart');
        });
    });
    (0, globals_1.describe)('POST /api/products', () => {
        (0, globals_1.it)('deve criar novo produto V2', async () => {
            const newProduct = {
                code: 'TEST-NEW-PRODUCT',
                name: 'Test New Product V2',
                description: 'Test description',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId().toString(),
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/products')
                .send(newProduct)
                .expect(201);
            (0, globals_1.expect)(response.body.success).toBe(true);
            (0, globals_1.expect)(response.body.product.code).toBe('TEST-NEW-PRODUCT');
            (0, globals_1.expect)(response.body.product.name).toBe('Test New Product V2');
            // Salvar ID para outros testes
            testProductId = response.body.product._id;
        });
        (0, globals_1.it)('deve falhar ao criar produto sem campos obrigatórios', async () => {
            const invalidProduct = {
                name: 'Invalid Product',
                // Faltando: code, platform, courseId
            };
            const response = await (0, supertest_1.default)(app)
                .post('/api/products')
                .send(invalidProduct)
                .expect(400);
            (0, globals_1.expect)(response.body.success).toBe(false);
        });
        (0, globals_1.it)('deve falhar ao criar produto com código duplicado', async () => {
            const product1 = {
                code: 'DUPLICATE-CODE',
                name: 'Product 1',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId().toString(),
            };
            // Criar primeiro produto
            await (0, supertest_1.default)(app)
                .post('/api/products')
                .send(product1)
                .expect(201);
            // Tentar criar com mesmo código
            const response = await (0, supertest_1.default)(app)
                .post('/api/products')
                .send(product1)
                .expect(409);
            (0, globals_1.expect)(response.body.success).toBe(false);
        });
    });
    (0, globals_1.describe)('GET /api/products/:id', () => {
        (0, globals_1.it)('deve retornar produto específico com stats', async () => {
            // Criar produto
            const product = await Product_1.default.create({
                code: 'TEST-SPECIFIC',
                name: 'Test Specific Product',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            const response = await (0, supertest_1.default)(app)
                .get(`/api/products/${product._id}`)
                .expect(200);
            (0, globals_1.expect)(response.body.success).toBe(true);
            (0, globals_1.expect)(response.body.product._id).toBe(product._id.toString());
            (0, globals_1.expect)(response.body).toHaveProperty('stats');
        });
        (0, globals_1.it)('deve retornar 404 para produto inexistente', async () => {
            const fakeId = new mongoose_1.default.Types.ObjectId();
            const response = await (0, supertest_1.default)(app)
                .get(`/api/products/${fakeId}`)
                .expect(404);
            (0, globals_1.expect)(response.body.success).toBe(false);
        });
    });
    (0, globals_1.describe)('UserProduct Integration', () => {
        (0, globals_1.it)('deve criar UserProduct vinculado ao Product', async () => {
            // Criar user
            const user = await User_1.default.create({
                name: 'Test User',
                email: 'test@example.com',
            });
            // Criar produto
            const product = await Product_1.default.create({
                code: 'TEST-INTEGRATION',
                name: 'Test Integration Product',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            // Criar UserProduct
            const userProduct = await UserProduct_1.default.create({
                userId: user._id,
                productId: product._id,
                platformData: {
                    platformId: 'hotmart',
                    externalUserId: 'hotmart-123',
                },
                status: 'ACTIVE',
                isActive: true,
                enrollmentDate: new Date(),
            });
            (0, globals_1.expect)(userProduct.productId.toString()).toBe(product._id.toString());
            (0, globals_1.expect)(userProduct.userId.toString()).toBe(user._id.toString());
            (0, globals_1.expect)(userProduct.status).toBe('ACTIVE');
        });
        (0, globals_1.it)('deve verificar unicidade userId + productId', async () => {
            const user = await User_1.default.create({
                name: 'Test User 2',
                email: 'test2@example.com',
            });
            const product = await Product_1.default.create({
                code: 'TEST-UNIQUE',
                name: 'Test Unique',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            // Criar primeiro UserProduct
            await UserProduct_1.default.create({
                userId: user._id,
                productId: product._id,
                platformData: { platformId: 'hotmart' },
                status: 'ACTIVE',
                isActive: true,
                enrollmentDate: new Date(),
            });
            // Tentar criar duplicado
            try {
                await UserProduct_1.default.create({
                    userId: user._id,
                    productId: product._id,
                    platformData: { platformId: 'hotmart' },
                    status: 'ACTIVE',
                    isActive: true,
                    enrollmentDate: new Date(),
                });
                // Se não lançou erro, falhar teste
                (0, globals_1.expect)(true).toBe(false);
            }
            catch (error) {
                // Esperado - erro de unique constraint
                (0, globals_1.expect)(error.code).toBe(11000);
            }
        });
    });
    (0, globals_1.describe)('GET /api/products/:id/students', () => {
        (0, globals_1.it)('deve retornar students de um produto', async () => {
            // Criar produto
            const product = await Product_1.default.create({
                code: 'TEST-STUDENTS',
                name: 'Test Students Product',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            // Criar users e UserProducts
            for (let i = 0; i < 3; i++) {
                const user = await User_1.default.create({
                    name: `Test User ${i}`,
                    email: `test${i}@example.com`,
                });
                await UserProduct_1.default.create({
                    userId: user._id,
                    productId: product._id,
                    platformData: { platformId: 'hotmart' },
                    status: 'ACTIVE',
                    isActive: true,
                    enrollmentDate: new Date(),
                });
            }
            const response = await (0, supertest_1.default)(app)
                .get(`/api/products/${product._id}/students`)
                .expect(200);
            (0, globals_1.expect)(response.body.success).toBe(true);
            (0, globals_1.expect)(response.body.students.length).toBe(3);
        });
    });
});
