"use strict";
// ════════════════════════════════════════════════════════════
// 📁 scripts/migration/rollback-v2.ts
// ROLLBACK: V2 → V1 (em caso de problemas)
// ════════════════════════════════════════════════════════════
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const user_1 = __importDefault(require("../../src/models/user"));
const UserProduct_1 = __importDefault(require("../../src/models/UserProduct"));
const Class_1 = require("../../src/models/Class");
const Product_1 = __importDefault(require("../../src/models/Product"));
dotenv_1.default.config();
const DRY_RUN = process.env.DRY_RUN === 'true' || false;
async function rollback() {
    console.log('🔄 INICIANDO ROLLBACK V2 → V1');
    console.log(`Mode: ${DRY_RUN ? '🔍 DRY RUN' : '✍️  LIVE'}`);
    console.log('─'.repeat(60));
    console.log('⚠️  ATENÇÃO: Este script apenas remove referências V2');
    console.log('⚠️  Os dados originais em User permanecem intactos');
    console.log('─'.repeat(60));
    let usersRestored = 0;
    let classesUpdated = 0;
    let userProductsFound = 0;
    let productsFound = 0;
    try {
        await mongoose_1.default.connect(process.env.MONGO_URI || '');
        console.log('✅ Conectado ao MongoDB\n');
        // ═══════════════════════════════════════════════════════════
        // PASSO 1: CONTAR O QUE SERÁ REMOVIDO
        // ═══════════════════════════════════════════════════════════
        console.log('📊 Analisando dados V2...');
        userProductsFound = await UserProduct_1.default.countDocuments();
        productsFound = await Product_1.default.countDocuments();
        const classesWithProduct = await Class_1.Class.countDocuments({ productId: { $exists: true } });
        console.log(`\nDados V2 encontrados:`);
        console.log(`  - ${userProductsFound} UserProducts`);
        console.log(`  - ${productsFound} Products`);
        console.log(`  - ${classesWithProduct} Classes com productId`);
        if (userProductsFound === 0 && productsFound === 0 && classesWithProduct === 0) {
            console.log('\n✅ Nenhum dado V2 encontrado. Sistema já está em V1.');
            process.exit(0);
        }
        // ═══════════════════════════════════════════════════════════
        // PASSO 2: VERIFICAR SE DADOS V1 ESTÃO INTACTOS
        // ═══════════════════════════════════════════════════════════
        console.log('\n🔍 Verificando integridade dos dados V1...');
        const usersWithHotmart = await user_1.default.countDocuments({ 'hotmart': { $exists: true } });
        const usersWithCurseduca = await user_1.default.countDocuments({ 'curseduca': { $exists: true } });
        console.log(`Users com dados V1:`);
        console.log(`  - ${usersWithHotmart} com dados Hotmart`);
        console.log(`  - ${usersWithCurseduca} com dados Curseduca`);
        if (usersWithHotmart === 0 && usersWithCurseduca === 0) {
            console.log('\n⚠️  ALERTA: Nenhum dado V1 encontrado nos Users!');
            console.log('⚠️  O rollback não pode restaurar dados que não existem.');
            console.log('⚠️  Os dados V1 originais podem ter sido removidos.');
            const proceed = process.env.FORCE_ROLLBACK === 'true';
            if (!proceed) {
                console.log('\n❌ Rollback cancelado por segurança.');
                console.log('💡 Use FORCE_ROLLBACK=true se tem certeza.');
                process.exit(1);
            }
        }
        // ═══════════════════════════════════════════════════════════
        // PASSO 3: REMOVER PRODUCTID DE CLASSES
        // ═══════════════════════════════════════════════════════════
        console.log('\n📚 Removendo productId de Classes...');
        if (!DRY_RUN) {
            const result = await Class_1.Class.updateMany({ productId: { $exists: true } }, { $unset: { productId: '' } });
            classesUpdated = result.modifiedCount || 0;
        }
        else {
            classesUpdated = classesWithProduct;
        }
        console.log(`✅ ${classesUpdated} classes atualizadas`);
        // ═══════════════════════════════════════════════════════════
        // PASSO 4: (OPCIONAL) LIMPAR COLLECTIONS V2
        // ═══════════════════════════════════════════════════════════
        console.log('\n⚠️  NOTA: UserProducts e Products NÃO serão apagados automaticamente');
        console.log('⚠️  Para segurança, use os comandos manualmente:');
        console.log('\n💡 Comandos para limpar completamente:');
        console.log('   db.userproducts.drop()');
        console.log('   db.products.drop()');
        if (process.env.DROP_V2_COLLECTIONS === 'true') {
            console.log('\n⚠️  DROP_V2_COLLECTIONS=true detectado!');
            if (!DRY_RUN) {
                console.log('🗑️  Removendo collections V2...');
                await UserProduct_1.default.deleteMany({});
                await Product_1.default.deleteMany({});
                console.log('✅ Collections V2 removidas');
            }
            else {
                console.log('🔍 (DRY RUN) Collections seriam removidas');
            }
        }
        // ═══════════════════════════════════════════════════════════
        // RELATÓRIO FINAL
        // ═══════════════════════════════════════════════════════════
        console.log('\n' + '═'.repeat(60));
        console.log('📋 RELATÓRIO DO ROLLBACK');
        console.log('═'.repeat(60));
        console.log(`\nDados V2 encontrados:`);
        console.log(`  - ${userProductsFound} UserProducts`);
        console.log(`  - ${productsFound} Products`);
        console.log(`\nAções realizadas:`);
        console.log(`  - ${classesUpdated} classes atualizadas (productId removido)`);
        if (process.env.DROP_V2_COLLECTIONS === 'true' && !DRY_RUN) {
            console.log(`  - Collections V2 removidas`);
        }
        else {
            console.log(`  - Collections V2 mantidas (use DROP_V2_COLLECTIONS=true para remover)`);
        }
        console.log('\n✅ ROLLBACK CONCLUÍDO');
        console.log('\n💡 PRÓXIMOS PASSOS:');
        console.log('   1. Verificar que sistema funciona com dados V1');
        console.log('   2. Se tudo OK, remover collections V2 manualmente');
        console.log('   3. Considerar re-executar migração com correções');
    }
    catch (error) {
        console.error('\n❌ ERRO:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
rollback();
