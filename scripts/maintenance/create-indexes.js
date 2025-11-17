"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../src/models/User"));
const UserProduct_1 = __importDefault(require("../../src/models/UserProduct"));
const Product_1 = __importDefault(require("../../src/models/Product"));
const Class_1 = __importDefault(require("../../src/models/Class"));
async function createIndexes() {
    try {
        console.log('🔍 CRIAÇÃO DE INDEXES - MongoDB Performance\n');
        console.log('='.repeat(70));
        await mongoose_1.default.connect(process.env.MONGO_URI);
        console.log('\n📊 Criando indexes para User...\n');
        // User indexes
        await User_1.default.collection.createIndex({ email: 1 }, { unique: true });
        console.log('✓ User.email (unique)');
        await User_1.default.collection.createIndex({ 'discord.userId': 1 });
        console.log('✓ User.discord.userId');
        await User_1.default.collection.createIndex({ 'hotmart.email': 1 });
        console.log('✓ User.hotmart.email');
        await User_1.default.collection.createIndex({ 'curseduca.email': 1 });
        console.log('✓ User.curseduca.email');
        await User_1.default.collection.createIndex({
            consolidatedCourses: 1,
            allPlatforms: 1
        });
        console.log('✓ User.consolidatedCourses + allPlatforms (compound)');
        await User_1.default.collection.createIndex({ lastActivityDate: 1 });
        console.log('✓ User.lastActivityDate');
        await User_1.default.collection.createIndex({
            'activeCampaign.lastEmailSent': 1,
            'activeCampaign.isActive': 1
        });
        console.log('✓ User.activeCampaign (compound)');
        // UserProduct indexes
        console.log('\n📊 Criando indexes para UserProduct...\n');
        await UserProduct_1.default.collection.createIndex({
            userId: 1,
            productId: 1
        }, { unique: true });
        console.log('✓ UserProduct.userId + productId (unique compound)');
        await UserProduct_1.default.collection.createIndex({ userId: 1 });
        console.log('✓ UserProduct.userId');
        await UserProduct_1.default.collection.createIndex({ productId: 1 });
        console.log('✓ UserProduct.productId');
        await UserProduct_1.default.collection.createIndex({
            'platformData.platformId': 1
        });
        console.log('✓ UserProduct.platformData.platformId');
        await UserProduct_1.default.collection.createIndex({ lastActivityDate: 1 });
        console.log('✓ UserProduct.lastActivityDate');
        // Product indexes
        console.log('\n📊 Criando indexes para Product...\n');
        await Product_1.default.collection.createIndex({ code: 1 }, { unique: true });
        console.log('✓ Product.code (unique)');
        await Product_1.default.collection.createIndex({ platform: 1 });
        console.log('✓ Product.platform');
        await Product_1.default.collection.createIndex({ isActive: 1 });
        console.log('✓ Product.isActive');
        // Class indexes
        console.log('\n📊 Criando indexes para Class...\n');
        await Class_1.default.collection.createIndex({ productId: 1 });
        console.log('✓ Class.productId');
        await Class_1.default.collection.createIndex({ date: 1 });
        console.log('✓ Class.date');
        await Class_1.default.collection.createIndex({
            productId: 1,
            date: -1
        });
        console.log('✓ Class.productId + date (compound, desc)');
        // Listar todos os indexes criados
        console.log('\n' + '='.repeat(70));
        console.log('\n📋 INDEXES EXISTENTES:\n');
        const userIndexes = await User_1.default.collection.indexes();
        console.log('User:', userIndexes.length, 'indexes');
        userIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        const userProductIndexes = await UserProduct_1.default.collection.indexes();
        console.log('\nUserProduct:', userProductIndexes.length, 'indexes');
        userProductIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        const productIndexes = await Product_1.default.collection.indexes();
        console.log('\nProduct:', productIndexes.length, 'indexes');
        productIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        const classIndexes = await Class_1.default.collection.indexes();
        console.log('\nClass:', classIndexes.length, 'indexes');
        classIndexes.forEach(idx => {
            console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
        });
        console.log('\n' + '='.repeat(70));
        console.log('\n✅ Todos os indexes criados com sucesso!\n');
    }
    catch (error) {
        console.error('\n❌ ERRO ao criar indexes:', error);
        throw error;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
// Executar
createIndexes();
