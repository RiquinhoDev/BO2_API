// ════════════════════════════════════════════════════════════
// 🔍 SCRIPT: Verificar TODAS as stats guardadas no MongoDB
// ════════════════════════════════════════════════════════════
// Ficheiro: check-all-dashboard-stats.ts
// Propósito: Encontrar de onde vêm os números errados (6832, 530)
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose';

async function checkAllDashboardStats() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');
    console.log('✅ Conectado ao MongoDB\n');

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database não disponível');

    // ════════════════════════════════════════════════════════════
    // 1. VERIFICAR COLLECTION: dashboardstats
    // ════════════════════════════════════════════════════════════
    console.log('📊 COLLECTION: dashboardstats');
    console.log('═══════════════════════════════════════════════════\n');

    const dashboardStats = await db.collection('dashboardstats').find({}).toArray();
    console.log(`Total de documentos: ${dashboardStats.length}\n`);

    dashboardStats.forEach((doc, index) => {
      console.log(`[${index + 1}] Version: ${doc.version}`);
      console.log(`    Total Students: ${doc.overview?.totalStudents}`);
      console.log(`    Calculated At: ${doc.calculatedAt}`);
      console.log(`    Platforms:`);
      
      if (doc.byPlatform) {
        doc.byPlatform.forEach((p: any) => {
          console.log(`       - ${p.name}: ${p.count} users (${p.percentage}%)`);
        });
      }
      console.log('');
    });

    // ════════════════════════════════════════════════════════════
    // 2. VERIFICAR SE HÁ STATS EM OUTRAS COLLECTIONS
    // ════════════════════════════════════════════════════════════
    const collections = await db.listCollections().toArray();
    const statsCollections = collections.filter(c => 
      c.name.toLowerCase().includes('stat') || 
      c.name.toLowerCase().includes('dashboard')
    );

    if (statsCollections.length > 1) {
      console.log('\n⚠️  ATENÇÃO: Múltiplas collections de stats encontradas:');
      statsCollections.forEach(c => console.log(`   - ${c.name}`));
      console.log('');
    }

    // ════════════════════════════════════════════════════════════
    // 3. VERIFICAR USERPRODUCTS TOTALS
    // ════════════════════════════════════════════════════════════
    console.log('\n📦 USERPRODUCTS:');
    console.log('═══════════════════════════════════════════════════\n');

    const totalUserProducts = await db.collection('userproducts').countDocuments({});
    const activeUserProducts = await db.collection('userproducts').countDocuments({ status: 'ACTIVE' });
    
    console.log(`Total UserProducts: ${totalUserProducts}`);
    console.log(`Active UserProducts: ${activeUserProducts}`);

    // Contar por plataforma
    const byPlatform = await db.collection('userproducts').aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $group: {
          _id: '$platform',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('\nUserProducts por plataforma (ACTIVE):');
    byPlatform.forEach((p: any) => {
      console.log(`   - ${p._id}: ${p.count}`);
    });

    // ════════════════════════════════════════════════════════════
    // 4. VERIFICAR USERS ÚNICOS
    // ════════════════════════════════════════════════════════════
    console.log('\n\n👥 USERS ÚNICOS:');
    console.log('═══════════════════════════════════════════════════\n');

    const uniqueUsers = await db.collection('userproducts').aggregate([
      { $match: { status: 'ACTIVE' } },
      {
        $group: {
          _id: '$userId'
        }
      },
      {
        $count: 'total'
      }
    ]).toArray();

    console.log(`Users únicos (via UserProducts): ${uniqueUsers[0]?.total || 0}`);

    // ════════════════════════════════════════════════════════════
    // 5. COMPARAÇÃO FINAL
    // ════════════════════════════════════════════════════════════
    console.log('\n\n🔍 COMPARAÇÃO:');
    console.log('═══════════════════════════════════════════════════\n');

    const latestStats = dashboardStats.find(d => d.version === 'v3');
    
    if (latestStats) {
      console.log('Stats V3 (dashboardstats):');
      console.log(`   Total Students: ${latestStats.overview.totalStudents}`);
      console.log(`   Platforms:`);
      latestStats.byPlatform.forEach((p: any) => {
        console.log(`      - ${p.name}: ${p.count}`);
      });
    }

    console.log('\nValores REAIS (via aggregation):');
    console.log(`   Unique Users: ${uniqueUsers[0]?.total || 0}`);
    console.log(`   Platforms:`);
    byPlatform.forEach((p: any) => {
      console.log(`      - ${p._id}: ${p.count}`);
    });

    // ════════════════════════════════════════════════════════════
    // 6. DIAGNÓSTICO
    // ════════════════════════════════════════════════════════════
    console.log('\n\n🎯 DIAGNÓSTICO:');
    console.log('═══════════════════════════════════════════════════\n');

    const dbTotal = uniqueUsers[0]?.total || 0;
    const statsTotal = latestStats?.overview?.totalStudents || 0;

    if (dbTotal !== statsTotal) {
      console.log(`❌ DIVERGÊNCIA ENCONTRADA!`);
      console.log(`   Dashboard stats: ${statsTotal}`);
      console.log(`   Dados reais (BD): ${dbTotal}`);
      console.log(`   Diferença: ${Math.abs(dbTotal - statsTotal)}`);
      console.log('');
      console.log('💡 SOLUÇÃO: Execute rebuild das stats:');
      console.log('   curl -X POST http://localhost:3001/api/dashboard/stats/v3/rebuild');
    } else {
      console.log(`✅ Stats estão CORRETOS!`);
      console.log(`   Total: ${dbTotal} (matches database)`);
    }

  } catch (error) {
    console.error('\n❌ ERRO:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n\n✅ Desconectado do MongoDB');
  }
}

// Executar
checkAllDashboardStats();