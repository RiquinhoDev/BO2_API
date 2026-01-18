// Script de teste para ver logs do sync
require('dotenv').config();

const { fetchCurseducaDataForSync } = require('./src/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.ts');

async function testSync() {
  console.log('🚀 Iniciando teste de sync...\n');

  try {
    const result = await fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      progressConcurrency: 5,
      enrichWithDetails: true
    });

    console.log('\n✅ SYNC COMPLETO!');
    console.log(`📊 Total de items: ${result.length}`);
    console.log('\n🎯 Primeiros 3 items:');
    result.slice(0, 3).forEach((item, i) => {
      console.log(`\n${i + 1}. ${item.email}`);
      console.log(`   groupId: ${item.groupId}`);
      console.log(`   groupName: ${item.groupName}`);
      console.log(`   isPrimary: ${item.platformData?.isPrimary}`);
      console.log(`   isDuplicate: ${item.platformData?.isDuplicate}`);
    });

  } catch (error) {
    console.error('\n❌ ERRO:', error.message);
    console.error(error);
  }
}

testSync();
