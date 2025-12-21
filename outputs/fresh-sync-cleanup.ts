// ════════════════════════════════════════════════════════════
// 🧹 FRESH SYNC - Limpar tudo e sincronizar do zero
// ════════════════════════════════════════════════════════════
// Remove TODOS os UserProducts de CursEDuca e Hotmart
// Depois faz sync completo das plataformas
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose';

async function freshSync() {
  try {
    console.log('\n🧹 FRESH SYNC - Limpeza completa');
    console.log('═══════════════════════════════════════════════════\n');

    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true");
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database não disponível');

    // ════════════════════════════════════════════════════════════
    // 1. BACKUP (mostrar stats antes de apagar)
    // ════════════════════════════════════════════════════════════
    console.log('📊 STATS ANTES DA LIMPEZA:');
    console.log('═══════════════════════════════════════════════════\n');

    const beforeStats = await db.collection('userproducts').aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $group: {
          _id: '$platform',
          userProducts: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          platform: '$_id',
          userProducts: 1,
          uniqueUsers: { $size: '$uniqueUsers' }
        }
      },
      { $sort: { platform: 1 } }
    ]).toArray();

    console.log('UserProducts por plataforma:');
    beforeStats.forEach((stat: any) => {
      console.log(`   ${stat.platform}: ${stat.uniqueUsers} users únicos (${stat.userProducts} UserProducts)`);
    });
    console.log('');

    // ════════════════════════════════════════════════════════════
    // 2. APAGAR CURSEDUCA
    // ════════════════════════════════════════════════════════════
    console.log('🗑️  PASSO 1: Apagando UserProducts CursEDuca...\n');

    const curseducaDeleted = await db.collection('userproducts').deleteMany({
      platform: 'curseduca'
    });

    console.log(`   ✅ Apagados ${curseducaDeleted.deletedCount} UserProducts CursEDuca\n`);

    // ════════════════════════════════════════════════════════════
    // 3. APAGAR HOTMART
    // ════════════════════════════════════════════════════════════
    console.log('🗑️  PASSO 2: Apagando UserProducts Hotmart...\n');

    const hotmartDeleted = await db.collection('userproducts').deleteMany({
      platform: 'hotmart'
    });

    console.log(`   ✅ Apagados ${hotmartDeleted.deletedCount} UserProducts Hotmart\n`);

    // ════════════════════════════════════════════════════════════
    // 4. LIMPAR DASHBOARD STATS
    // ════════════════════════════════════════════════════════════
    console.log('🗑️  PASSO 3: Limpando dashboard stats...\n');

    const statsDeleted = await db.collection('dashboardstats').deleteMany({});

    console.log(`   ✅ Apagados ${statsDeleted.deletedCount} documentos de stats\n`);

    // ════════════════════════════════════════════════════════════
    // 5. VERIFICAR RESULTADO
    // ════════════════════════════════════════════════════════════
    console.log('📊 STATS APÓS LIMPEZA:');
    console.log('═══════════════════════════════════════════════════\n');

    const afterStats = await db.collection('userproducts').aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $group: {
          _id: '$platform',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]).toArray();

    if (afterStats.length === 0) {
      console.log('   ✅ Nenhum UserProduct de Hotmart ou CursEDuca restante!');
      console.log('   (Discord permanece intacto)\n');
    } else {
      console.log('UserProducts restantes:');
      afterStats.forEach((stat: any) => {
        console.log(`   - ${stat._id}: ${stat.count}`);
      });
      console.log('');
    }

    // ════════════════════════════════════════════════════════════
    // 6. SUMÁRIO
    // ════════════════════════════════════════════════════════════
    console.log('\n✅ LIMPEZA COMPLETA!');
    console.log('═══════════════════════════════════════════════════\n');
    console.log('📊 Resumo:');
    console.log(`   🗑️  CursEDuca: ${curseducaDeleted.deletedCount} UserProducts removidos`);
    console.log(`   🗑️  Hotmart: ${hotmartDeleted.deletedCount} UserProducts removidos`);
    console.log(`   🗑️  Dashboard Stats: ${statsDeleted.deletedCount} removidos`);
    console.log('');
    console.log('💡 PRÓXIMOS PASSOS:');
    console.log('   1. Executar sync CursEDuca:');
    console.log('      curl -X GET http://localhost:3001/api/curseduca/sync/universal');
    console.log('');
    console.log('   2. Executar sync Hotmart:');
    console.log('      curl -X GET http://localhost:3001/api/hotmart/sync/universal');
    console.log('');
    console.log('   3. Rebuild dashboard stats:');
    console.log('      curl -X POST http://localhost:3001/api/dashboard/stats/v3/rebuild');
    console.log('');
    console.log('   4. Hard refresh no browser:');
    console.log('      Ctrl + Shift + R');
    console.log('');
    console.log('🌙 A partir de hoje, syncs automáticos às 00:00 manterão');
    console.log('   os dados sempre sincronizados com as plataformas reais!\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Desconectado do MongoDB\n');
  }
}

freshSync();