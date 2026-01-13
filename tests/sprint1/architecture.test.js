"use strict";
// ════════════════════════════════════════════════════════════
// 📁 tests/sprint1/architecture.test.ts
// TESTES DA NOVA ARQUITETURA V2
// ════════════════════════════════════════════════════════════
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const chai_1 = require("chai");
const user_1 = __importDefault(require("../../src/models/user"));
const Product_1 = __importDefault(require("../../src/models/product/Product"));
const UserProduct_1 = __importDefault(require("../../src/models/UserProduct"));
const Course_1 = __importDefault(require("../../src/models/Course"));
const Class_1 = require("../../src/models/Class");
describe('Sprint 1: Architecture V2', () => {
    before(async () => {
        await mongoose_1.default.connect(process.env.MONGO_URI_TEST || process.env.MONGO_URI || '');
    });
    after(async () => {
        // Cleanup
        await UserProduct_1.default.deleteMany({ source: 'TEST' });
        await Product_1.default.deleteMany({ code: /^TEST-/ });
        await user_1.default.deleteMany({ email: /test-arch-v2/ });
        await mongoose_1.default.disconnect();
    });
    describe('Product Model', () => {
        it('deve criar produto com todos os campos obrigatórios', async () => {
            const course = await Course_1.default.findOne({ code: 'OGI' });
            if (!course) {
                console.warn('⚠️  Course OGI não encontrado, pulando teste');
                return;
            }
            const product = await Product_1.default.create({
                code: 'TEST-PRODUCT-1',
                name: 'Produto de Teste 1',
                platform: 'hotmart',
                courseId: course._id,
                hotmartProductId: 'test-123',
                isActive: true,
                activeCampaignConfig: {
                    tagPrefix: 'TEST',
                    listId: '1'
                }
            });
            (0, chai_1.expect)(product.code).to.equal('TEST-PRODUCT-1');
            (0, chai_1.expect)(product.platform).to.equal('hotmart');
            (0, chai_1.expect)(product.isActive).to.be.true;
            (0, chai_1.expect)(product.getPlatformId()).to.equal('test-123');
        });
        it('deve impedir produtos com mesmo code', async () => {
            const course = await Course_1.default.findOne({ code: 'OGI' });
            if (!course) {
                console.warn('⚠️  Course OGI não encontrado, pulando teste');
                return;
            }
            try {
                await Product_1.default.create({
                    code: 'TEST-PRODUCT-1', // Duplicado do teste anterior
                    name: 'Duplicado',
                    platform: 'curseduca',
                    courseId: course._id,
                    isActive: true
                });
                chai_1.expect.fail('Deveria ter falhado com duplicate key');
            }
            catch (error) {
                (0, chai_1.expect)(error.code).to.equal(11000); // Duplicate key
            }
        });
        it('deve verificar disponibilidade do produto', async () => {
            const course = await Course_1.default.findOne({ code: 'OGI' });
            if (!course) {
                console.warn('⚠️  Course OGI não encontrado, pulando teste');
                return;
            }
            // Produto ativo
            const activeProduct = await Product_1.default.create({
                code: 'TEST-PRODUCT-ACTIVE',
                name: 'Produto Ativo',
                platform: 'hotmart',
                courseId: course._id,
                isActive: true
            });
            (0, chai_1.expect)(activeProduct.isAvailable()).to.be.true;
            // Produto inativo
            const inactiveProduct = await Product_1.default.create({
                code: 'TEST-PRODUCT-INACTIVE',
                name: 'Produto Inativo',
                platform: 'hotmart',
                courseId: course._id,
                isActive: false
            });
            (0, chai_1.expect)(inactiveProduct.isAvailable()).to.be.false;
        });
    });
    describe('UserProduct Model', () => {
        let testUser;
        let testProduct;
        before(async () => {
            const course = await Course_1.default.findOne({ code: 'OGI' });
            if (!course) {
                console.warn('⚠️  Course OGI não encontrado, pulando testes UserProduct');
                return;
            }
            testUser = await user_1.default.create({
                name: 'Test User Arch V2',
                email: 'test-arch-v2@example.com',
                metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    sources: {}
                }
            });
            testProduct = await Product_1.default.findOne({ code: 'TEST-PRODUCT-1' });
            if (!testProduct) {
                testProduct = await Product_1.default.create({
                    code: 'TEST-PRODUCT-UP',
                    name: 'Produto para UserProduct',
                    platform: 'hotmart',
                    courseId: course._id,
                    isActive: true
                });
            }
        });
        it('deve criar enrollment de user em produto', async () => {
            if (!testUser || !testProduct) {
                console.warn('⚠️  testUser ou testProduct não disponível, pulando teste');
                return;
            }
            const userProduct = await UserProduct_1.default.create({
                userId: testUser._id,
                productId: testProduct._id,
                platform: 'hotmart',
                platformUserId: 'hotmart-test-123',
                enrolledAt: new Date(),
                status: 'ACTIVE',
                source: 'TEST',
                progress: {
                    percentage: 0
                },
                engagement: {
                    engagementScore: 0
                },
                classes: []
            });
            (0, chai_1.expect)(userProduct.userId.toString()).to.equal(testUser._id.toString());
            (0, chai_1.expect)(userProduct.platform).to.equal('hotmart');
            (0, chai_1.expect)(userProduct.isActive()).to.be.true;
        });
        it('deve impedir enrollment duplicado no mesmo produto', async () => {
            if (!testUser || !testProduct) {
                console.warn('⚠️  testUser ou testProduct não disponível, pulando teste');
                return;
            }
            try {
                await UserProduct_1.default.create({
                    userId: testUser._id,
                    productId: testProduct._id,
                    platform: 'hotmart',
                    platformUserId: 'hotmart-test-456',
                    enrolledAt: new Date(),
                    status: 'ACTIVE',
                    source: 'TEST'
                });
                chai_1.expect.fail('Deveria ter falhado com duplicate key');
            }
            catch (error) {
                (0, chai_1.expect)(error.code).to.equal(11000); // Duplicate key
            }
        });
        it('deve permitir user em produtos diferentes', async () => {
            if (!testUser) {
                console.warn('⚠️  testUser não disponível, pulando teste');
                return;
            }
            const course = await Course_1.default.findOne({ code: 'CLAREZA' });
            if (!course) {
                console.warn('⚠️  Course CLAREZA não encontrado, pulando teste');
                return;
            }
            const clarezaProduct = await Product_1.default.create({
                code: 'TEST-CLAREZA-1',
                name: 'Clareza Teste',
                platform: 'curseduca',
                courseId: course._id,
                isActive: true
            });
            const userProduct = await UserProduct_1.default.create({
                userId: testUser._id,
                productId: clarezaProduct._id,
                platform: 'curseduca',
                platformUserId: 'curseduca-test-789',
                enrolledAt: new Date(),
                status: 'ACTIVE',
                source: 'TEST'
            });
            (0, chai_1.expect)(userProduct).to.exist;
            // Verificar que user tem 2 produtos
            const userProducts = await UserProduct_1.default.find({ userId: testUser._id, source: 'TEST' });
            (0, chai_1.expect)(userProducts.length).to.be.at.least(2);
        });
        it('deve calcular dias desde enrollment', async () => {
            if (!testUser || !testProduct) {
                console.warn('⚠️  testUser ou testProduct não disponível, pulando teste');
                return;
            }
            const userProduct = await UserProduct_1.default.findOne({
                userId: testUser._id,
                productId: testProduct._id
            });
            if (!userProduct) {
                console.warn('⚠️  UserProduct não encontrado, pulando teste');
                return;
            }
            const days = userProduct.getDaysSinceEnrollment();
            (0, chai_1.expect)(days).to.be.a('number');
            (0, chai_1.expect)(days).to.be.at.least(0);
        });
    });
    describe('Class Model com productId', () => {
        let testProduct;
        before(async () => {
            testProduct = await Product_1.default.findOne({ code: 'TEST-PRODUCT-1' });
        });
        it('deve criar turma com productId', async () => {
            if (!testProduct) {
                console.warn('⚠️  testProduct não disponível, pulando teste');
                return;
            }
            const classDoc = await Class_1.Class.create({
                classId: 'TEST-CLASS-V2-1',
                name: 'Turma Teste V2',
                productId: testProduct._id,
                studentCount: 0,
                isActive: true,
                source: 'manual'
            });
            (0, chai_1.expect)(classDoc.productId?.toString()).to.equal(testProduct._id.toString());
            // Cleanup
            await Class_1.Class.deleteOne({ _id: classDoc._id });
        });
    });
    describe('Índices e Performance', () => {
        it('deve ter índice único em userId + productId no UserProduct', async () => {
            const indexes = await UserProduct_1.default.collection.getIndexes();
            const uniqueIndex = Object.values(indexes).find((idx) => idx.unique &&
                idx.key &&
                idx.key.userId &&
                idx.key.productId);
            (0, chai_1.expect)(uniqueIndex).to.exist;
        });
        it('deve ter índices em Product.code', async () => {
            const indexes = await Product_1.default.collection.getIndexes();
            const codeIndex = Object.values(indexes).find((idx) => idx.key && idx.key.code);
            (0, chai_1.expect)(codeIndex).to.exist;
        });
    });
});
