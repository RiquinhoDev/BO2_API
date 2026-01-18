// Correr sync CursEduca DIRETAMENTE (sem servidor)
require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function runSync() {
  try {
    console.log('🔌 Conectando à base de dados...\n');

    await mongoose.connect(MONGO_URI);

    console.log('✅ Conectado!');
    console.log('📡 Importando módulos do sync...\n');

    // Importar o Universal Sync Service
    const { executeUniversalSync } = require('./src/services/syncUtilizadoresServices/universalSyncService.ts');
    const { fetchCurseducaDataForSync } = require('./src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.ts');

    console.log('🚀 Buscando dados da CursEduca API...\n');

    // Buscar dados
    const sourceData = await fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      progressConcurrency: 5,
      enrichWithDetails: true
    });

    console.log(`\n✅ Dados recebidos: ${sourceData.length} items\n`);
    console.log('🔄 Executando sync...\n');

    // Executar sync
    const result = await executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'Manual Sync - Test',
      triggeredBy: 'MANUAL',
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50,
      sourceData
    });

    console.log('\n✅ SYNC COMPLETO!\n');
    console.log('📊 RESULTADO:\n');
    console.log(JSON.stringify(result, null, 2));

    await mongoose.disconnect();
    console.log('\n✅ Desconectado da BD');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runSync();
