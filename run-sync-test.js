// Correr sync manual e monitorizar criação de UserProducts
require('dotenv').config();
const mongoose = require('mongoose');

async function runSyncTest() {
  try {
    console.log('═══════════════════════════════════════════');
    console.log('🧪 TESTE DE SYNC - DIAGNÓSTICO DE DUPLICAÇÃO');
    console.log('═══════════════════════════════════════════\n');

    await mongoose.connect(process.env.MONGO_URI);

    const UP = mongoose.connection.collection('userproducts');
    const Product = mongoose.connection.collection('products');

    // 1. Verificar estado inicial
    console.log('📊 ESTADO INICIAL:\n');

    const products = await Product.find({ platform: 'curseduca' }).toArray();
    console.log(`Produtos Curseduca: ${products.length}`);
    products.forEach(p => {
      console.log(`  - ${p.code}: groupId=${p.curseducaGroupId}`);
    });

    const initialCount = await UP.countDocuments({ platform: 'curseduca' });
    console.log(`\nUserProducts Curseduca: ${initialCount}`);

    // 2. Importar e executar adapter
    console.log('\n─────────────────────────────────────────');
    console.log('📡 EXECUTANDO ADAPTER:\n');

    const { fetchCurseducaDataForSync } = require('./dist/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.js');
    const adapterData = await fetchCurseducaDataForSync();

    console.log(`\n✅ Adapter retornou: ${adapterData.length} items`);

    // Analisar dados do adapter
    const byGroupId = {};
    adapterData.forEach(item => {
      byGroupId[item.groupId] = (byGroupId[item.groupId] || 0) + 1;
    });

    console.log('\n📊 Distribuição por groupId:');
    Object.entries(byGroupId).forEach(([groupId, count]) => {
      console.log(`  groupId ${groupId}: ${count} users`);
    });

    // 3. Executar UniversalSync
    console.log('\n─────────────────────────────────────────');
    console.log('🔄 EXECUTANDO UNIVERSAL SYNC:\n');

    const universalSyncService = require('./dist/services/syncUtilizadoresServices/universalSyncService.js');

    const syncResult = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'TESTE_DIAGNOSTICO',
      triggeredBy: 'MANUAL',
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: adapterData
    });

    console.log('\n✅ Sync completo!');
    console.log(`   Duração: ${syncResult.duration}s`);
    console.log(`   Total processado: ${syncResult.stats.total}`);
    console.log(`   Inseridos: ${syncResult.stats.inserted}`);
    console.log(`   Atualizados: ${syncResult.stats.updated}`);
    console.log(`   Erros: ${syncResult.stats.errors}`);

    // 4. Verificar estado final
    console.log('\n─────────────────────────────────────────');
    console.log('📊 ESTADO FINAL:\n');

    const finalCount = await UP.countDocuments({ platform: 'curseduca' });
    console.log(`UserProducts Curseduca criados: ${finalCount}`);

    const byProduct = await UP.aggregate([
      { $match: { platform: 'curseduca' } },
      {
        $group: {
          _id: '$productId',
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    console.log('\n📊 Distribuição por produto:');
    for (const group of byProduct) {
      const product = await Product.findOne({ _id: group._id });
      console.log(`  ${product.code}: ${group.count} UserProducts`);
    }

    // 5. Análise de duplicação
    console.log('\n─────────────────────────────────────────');
    console.log('🔍 ANÁLISE DE DUPLICAÇÃO:\n');

    const duplicates = await UP.aggregate([
      { $match: { platform: 'curseduca' } },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $group: {
          _id: '$user.email',
          count: { $sum: 1 },
          products: { $push: { productId: '$productId', classId: { $arrayElemAt: ['$classes.classId', 0] } } }
        }
      },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log(`Emails com múltiplos UserProducts: ${duplicates.length}`);

    if (duplicates.length > 0) {
      console.log('\n❌ PROBLEMA DETECTADO! Exemplos de duplicados:\n');
      duplicates.slice(0, 5).forEach(d => {
        console.log(`  ${d._id}: ${d.count} UserProducts`);
        d.products.forEach((p, idx) => {
          console.log(`    ${idx + 1}. ProductId: ${p.productId}, ClassId: ${p.classId}`);
        });
      });
    } else {
      console.log('✅ Sem duplicados!');
    }

    // 6. Conclusão
    console.log('\n═══════════════════════════════════════════');
    console.log('📋 CONCLUSÃO:\n');

    console.log(`Adapter retornou: ${adapterData.length} items`);
    console.log(`UserProducts criados: ${finalCount}`);
    console.log(`Diferença: ${finalCount - adapterData.length}`);

    if (finalCount === adapterData.length) {
      console.log('\n✅ SUCESSO! Cada item do adapter criou 1 UserProduct');
    } else if (finalCount === adapterData.length * 2) {
      console.log('\n❌ PROBLEMA! Cada item do adapter criou 2 UserProducts');
      console.log('   O bug está no UniversalSync que está criando duplicados');
    } else {
      console.log('\n⚠️ RESULTADO INESPERADO!');
    }

    console.log('\n═══════════════════════════════════════════\n');

    await mongoose.disconnect();
  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error.stack);
  }
}

runSyncTest();
