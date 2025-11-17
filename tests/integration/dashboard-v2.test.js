"use strict";
// tests/integration/dashboard-v2.test.ts
// 🧪 Sprint 4: Integration Tests for Dashboard API V2
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
let app;
(0, globals_1.describe)('Dashboard API V2 - Integration Tests', () => {
    (0, globals_1.beforeAll)(async () => {
        const mongoUri = process.env.MONGO_URI_TEST || 'mongodb://localhost:27017/test-db';
        await mongoose_1.default.connect(mongoUri);
        app = (await Promise.resolve().then(() => __importStar(require('../../src/app')))).default;
    });
    (0, globals_1.afterAll)(async () => {
        await Product_1.default.deleteMany({});
        await UserProduct_1.default.deleteMany({});
        await User_1.default.deleteMany({});
        await mongoose_1.default.disconnect();
    });
    (0, globals_1.beforeEach)(async () => {
        await Product_1.default.deleteMany({});
        await UserProduct_1.default.deleteMany({});
        await User_1.default.deleteMany({});
    });
    (0, globals_1.describe)('GET /api/dashboard/stats/v2', () => {
        (0, globals_1.it)('deve retornar stats V2 corretamente', async () => {
            // Criar produtos
            const product1 = await Product_1.default.create({
                code: 'OGI-TEST',
                name: 'OGI Test',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            const product2 = await Product_1.default.create({
                code: 'CLAREZA-TEST',
                name: 'Clareza Test',
                platform: 'curseduca',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            // Criar users e UserProducts
            for (let i = 0; i < 5; i++) {
                const user = await User_1.default.create({
                    name: `User ${i}`,
                    email: `user${i}@test.com`,
                });
                // 3 users no produto 1
                if (i < 3) {
                    await UserProduct_1.default.create({
                        userId: user._id,
                        productId: product1._id,
                        platformData: { platformId: 'hotmart' },
                        status: 'ACTIVE',
                        isActive: true,
                        enrollmentDate: new Date(),
                    });
                }
                // 2 users no produto 2
                if (i >= 3) {
                    await UserProduct_1.default.create({
                        userId: user._id,
                        productId: product2._id,
                        platformData: { platformId: 'curseduca' },
                        status: 'ACTIVE',
                        isActive: true,
                        enrollmentDate: new Date(),
                    });
                }
            }
            const response = await (0, supertest_1.default)(app)
                .get('/api/dashboard/stats/v2')
                .expect(200);
            (0, globals_1.expect)(response.body.success).toBe(true);
            (0, globals_1.expect)(response.body.data).toHaveProperty('totalUserProducts');
            (0, globals_1.expect)(response.body.data.totalUserProducts).toBe(5);
            (0, globals_1.expect)(response.body.data).toHaveProperty('byProduct');
            (0, globals_1.expect)(Array.isArray(response.body.data.byProduct)).toBe(true);
            (0, globals_1.expect)(response.body.data).toHaveProperty('activeUsers');
            (0, globals_1.expect)(response.body.data.activeUsers).toBe(5);
        });
        (0, globals_1.it)('deve retornar breakdown por produto', async () => {
            const product = await Product_1.default.create({
                code: 'BREAKDOWN-TEST',
                name: 'Breakdown Test',
                platform: 'hotmart',
                courseId: new mongoose_1.default.Types.ObjectId(),
                settings: { allowMultipleEnrollments: false, requiresApproval: false },
                features: { hasClasses: true, hasProgress: true, hasEngagement: true, hasReports: true },
                isActive: true,
            });
            for (let i = 0; i < 3; i++) {
                const user = await User_1.default.create({
                    name: `User ${i}`,
                    email: `user${i}@test.com`,
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
                .get('/api/dashboard/stats/v2')
                .expect(200);
            const productBreakdown = response.body.data.byProduct.find((p) => p.code === 'BREAKDOWN-TEST');
            (0, globals_1.expect)(productBreakdown).toBeDefined();
            (0, globals_1.expect)(productBreakdown.count).toBe(3);
        });
    });
});
