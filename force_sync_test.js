// ════════════════════════════════════════════════════════════
// SCRIPT SIMPLES: Forçar Sync Hotmart + Curseduca
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');

async function forceSync() {
  try {
    const uri = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true';
    await mongoose.connect(uri);
    console.log('✅ Conectado à MongoDB\n');

    // Importar serviços
    const universalSyncService = require('./dist/services/syncUtilziadoresServices/universalSyncService').default;
    const hotmartAdapter = require('./dist/services/syncUtilziadoresServices/hotmartServices/hotmart.adapter').default;
    const curseducaAdapter = require('./dist/services/syncUtilziadoresServices/curseducaServices/curseduca.adapter').default;

    console.log('🔥 STEP 1: Sincronizando Hotmart...\n');

    // Fetch dados Hotmart
    console.log('   📡 Fetching Hotmart data...');
    const hotmartData = await hotmartAdapter.fetchHotmartDataForSync();
    console.log(`   ✅ Fetched ${hotmartData.length} Hotmart users\n`);

    // Executar sync
    console.log('   🔄 Executing universal sync...');
    const hotmartResult = await universalSyncService.executeUniversalSync({
      syncType: 'hotmart',
      jobName: 'Manual Test Sync - Hotmart',
      triggeredBy: 'MANUAL',
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: hotmartData
    });

    console.log('   ✅ Hotmart Sync Complete:');
    console.log(`      Total: ${hotmartResult.stats.total}`);
    console.log(`      Inserted: ${hotmartResult.stats.inserted}`);
    console.log(`      Updated: ${hotmartResult.stats.updated}`);
    console.log(`      Errors: ${hotmartResult.stats.errors}\n`);

    console.log('🎓 STEP 2: Sincronizando Curseduca...\n');

    // Fetch dados Curseduca
    console.log('   📡 Fetching Curseduca data...');
    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      enrichWithDetails: true
    });
    console.log(`   ✅ Fetched ${curseducaData.length} Curseduca users\n`);

    // Executar sync
    console.log('   🔄 Executing universal sync...');
    const curseducaResult = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'Manual Test Sync - Curseduca',
      triggeredBy: 'MANUAL',
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData: curseducaData
    });

    console.log('   ✅ Curseduca Sync Complete:');
    console.log(`      Total: ${curseducaResult.stats.total}`);
    console.log(`      Inserted: ${curseducaResult.stats.inserted}`);
    console.log(`      Updated: ${curseducaResult.stats.updated}`);
    console.log(`      Errors: ${curseducaResult.stats.errors}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ SYNC COMPLETO!');
    console.log('═══════════════════════════════════════════════════════════\n');

    await mongoose.connection.close();
    console.log('✅ Conexão fechada');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

forceSync();
