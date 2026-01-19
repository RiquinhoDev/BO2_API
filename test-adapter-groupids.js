// Verificar groupIds que o adapter está retornando
require('dotenv').config();
const path = require('path');

async function testAdapter() {
  try {
    console.log('🔍 Verificando groupIds retornados pelo adapter...\n');

    const { fetchCurseducaDataForSync } = require('./dist/services/syncUtilizadoresServices/curseducaServices/curseduca.adapter.js');

    const result = await fetchCurseducaDataForSync();

    console.log(`Total de items retornados: ${result.length}\n`);

    // Agrupar por groupId
    const byGroupId = {};
    result.forEach(item => {
      const gid = item.groupId;
      if (!byGroupId[gid]) {
        byGroupId[gid] = [];
      }
      byGroupId[gid].push(item.email);
    });

    console.log('📊 Distribuição por groupId:');
    Object.entries(byGroupId).forEach(([groupId, emails]) => {
      console.log(`  groupId ${groupId}: ${emails.length} users`);
    });

    // Verificar se há emails duplicados
    const emailCounts = {};
    result.forEach(item => {
      emailCounts[item.email] = (emailCounts[item.email] || 0) + 1;
    });

    const duplicates = Object.entries(emailCounts).filter(([email, count]) => count > 1);

    if (duplicates.length > 0) {
      console.log(`\n⚠️  DUPLICADOS ENCONTRADOS: ${duplicates.length} emails aparecem mais de 1 vez`);
      console.log('\nExemplos de duplicados:');
      duplicates.slice(0, 5).forEach(([email, count]) => {
        console.log(`  ${email}: ${count}x`);
        const items = result.filter(i => i.email === email);
        items.forEach(item => {
          console.log(`    → groupId: ${item.groupId}, isPrimary: ${item.isPrimary}, isDuplicate: ${item.isDuplicate}`);
        });
      });
    } else {
      console.log('\n✅ Sem duplicados - cada email aparece apenas 1 vez');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
  }
}

testAdapter();
