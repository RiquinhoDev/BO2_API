"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../src/models/User"));
const UserProduct_1 = __importDefault(require("../../src/models/UserProduct"));
const Product_1 = __importDefault(require("../../src/models/Product"));
async function diagnoseDashboardStats() {
    try {
        console.log('🔍 DIAGNÓSTICO: Dashboard Statistics\n');
        console.log('='.repeat(70));
        await mongoose_1.default.connect(process.env.MONGO_URI);
        // 1. Total Users
        console.log('\n📊 CONTAGENS BÁSICAS:\n');
        const totalUsers = await User_1.default.countDocuments();
        console.log(`Total Users: ${totalUsers}`);
        const discordUsers = await User_1.default.countDocuments({
            'discord.userId': { $exists: true }
        });
        console.log(`Discord Users: ${discordUsers}`);
        const hotmartUsers = await User_1.default.countDocuments({
            'hotmart.email': { $exists: true }
        });
        console.log(`Hotmart Users: ${hotmartUsers}`);
        const cursEducaUsers = await User_1.default.countDocuments({
            'curseduca.email': { $exists: true }
        });
        console.log(`CursEduca Users: ${cursEducaUsers}`);
        // 2. Multi-platform users
        console.log('\n📊 MULTI-PLATFORM ANALYSIS:\n');
        const multiPlatform = await User_1.default.countDocuments({
            $expr: { $gt: [{ $size: { $ifNull: ['$allPlatforms', []] } }, 1] }
        });
        console.log(`Multi-platform Users: ${multiPlatform}`);
        // Breakdown detalhado
        const platformCombinations = await User_1.default.aggregate([
            {
                $match: {
                    $expr: { $gt: [{ $size: { $ifNull: ['$allPlatforms', []] } }, 1] }
                }
            },
            {
                $group: {
                    _id: '$allPlatforms',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        console.log('\nCombinações de plataformas:');
        platformCombinations.forEach(combo => {
            console.log(`  ${combo._id.join(' + ')}: ${combo.count} users`);
        });
        // 3. Breakdown por curso
        console.log('\n📊 BREAKDOWN POR CURSO:\n');
        const ogiUsers = await User_1.default.countDocuments({
            consolidatedCourses: 'ogi'
        });
        console.log(`OGI Students: ${ogiUsers}`);
        const clarezaUsers = await User_1.default.countDocuments({
            consolidatedCourses: 'clareza'
        });
        console.log(`Clareza Students: ${clarezaUsers}`);
        // 4. UserProducts (V2)
        console.log('\n📊 ARCHITECTURE V2 (UserProducts):\n');
        const totalUserProducts = await UserProduct_1.default.countDocuments();
        console.log(`Total UserProducts: ${totalUserProducts}`);
        if (totalUserProducts > 0) {
            const upByProduct = await UserProduct_1.default.aggregate([
                {
                    $lookup: {
                        from: 'products',
                        localField: 'productId',
                        foreignField: '_id',
                        as: 'product'
                    }
                },
                { $unwind: '$product' },
                {
                    $group: {
                        _id: '$product.code',
                        count: { $sum: 1 }
                    }
                },
                { $sort: { count: -1 } }
            ]);
            console.log('\nUserProducts por produto:');
            upByProduct.forEach(item => {
                console.log(`  ${item._id}: ${item.count} registos`);
            });
        }
        // 5. Verificar consistência V1 vs V2
        console.log('\n📊 CONSISTÊNCIA V1 vs V2:\n');
        // OGI: Hotmart users vs OGI UserProducts
        const ogiProduct = await Product_1.default.findOne({ code: 'OGI-V1' });
        const ogiUserProducts = ogiProduct
            ? await UserProduct_1.default.countDocuments({ productId: ogiProduct._id })
            : 0;
        console.log(`Hotmart users (V1): ${hotmartUsers}`);
        console.log(`OGI UserProducts (V2): ${ogiUserProducts}`);
        console.log(`Diferença: ${Math.abs(hotmartUsers - ogiUserProducts)}`);
        if (hotmartUsers !== ogiUserProducts) {
            console.log('⚠️  INCONSISTÊNCIA DETECTADA entre V1 e V2 (OGI/Hotmart)');
        }
        else {
            console.log('✅ Consistência OK (OGI/Hotmart)');
        }
        // 6. Sample de users para inspeção manual
        console.log('\n📊 SAMPLE DE USERS (primeiros 5 multi-platform):\n');
        const sampleUsers = await User_1.default.find({
            $expr: { $gt: [{ $size: { $ifNull: ['$allPlatforms', []] } }, 1] }
        }).limit(5);
        for (const user of sampleUsers) {
            console.log(`\n👤 ${user.email} (${user._id}):`);
            console.log(`  Platforms: ${user.allPlatforms?.join(', ') || 'NONE'}`);
            console.log(`  Courses: ${user.consolidatedCourses?.join(', ') || 'NONE'}`);
            console.log(`  Discord: ${user.discord?.courses?.join(', ') || 'N/A'}`);
            console.log(`  Hotmart: ${user.hotmart?.courses?.join(', ') || 'N/A'}`);
            console.log(`  CursEduca: ${user.curseduca?.courses?.join(', ') || 'N/A'}`);
            // Verificar se tem UserProducts correspondentes
            const ups = await UserProduct_1.default.find({ userId: user._id }).populate('productId');
            console.log(`  UserProducts: ${ups.length}`);
            ups.forEach(up => {
                console.log(`    - ${up.productId.code}: ${up.platformData?.platformId || 'N/A'}`);
            });
        }
        console.log('\n' + '='.repeat(70));
        console.log('\n✅ Diagnóstico completo!\n');
    }
    catch (error) {
        console.error('\n❌ ERRO no diagnóstico:', error);
        throw error;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
// Executar
diagnoseDashboardStats();
