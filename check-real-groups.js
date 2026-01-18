// Verificar os grupos REAIS (sem UUID)
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkRealGroups() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('🔍 INVESTIGANDO GRUPOS REAIS (sem UUID)\n');

    // Clareza - Anual (290 alunos)
    const anualSample = await usersCol.findOne({
      'curseduca.groupName': 'Clareza - Anual',
      'curseduca.groupCurseducaUuid': { $exists: false }
    });

    console.log('📌 Clareza - Anual (290 alunos)');
    if (anualSample) {
      console.log(`   groupName: ${anualSample.curseduca?.groupName}`);
      console.log(`   groupCurseducaUuid: ${anualSample.curseduca?.groupCurseducaUuid || 'N/A'}`);
      console.log(`   groupCurseducaId: ${anualSample.curseduca?.groupCurseducaId || 'N/A'}`);
      console.log(`   groupId: ${anualSample.curseduca?.groupId || 'N/A'}`);
    }

    // Clareza - Mensal (40 alunos)
    const mensalSample = await usersCol.findOne({
      'curseduca.groupName': 'Clareza - Mensal',
      'curseduca.groupCurseducaUuid': { $exists: false }
    });

    console.log('\n📌 Clareza - Mensal (40 alunos)');
    if (mensalSample) {
      console.log(`   groupName: ${mensalSample.curseduca?.groupName}`);
      console.log(`   groupCurseducaUuid: ${mensalSample.curseduca?.groupCurseducaUuid || 'N/A'}`);
      console.log(`   groupCurseducaId: ${mensalSample.curseduca?.groupCurseducaId || 'N/A'}`);
      console.log(`   groupId: ${mensalSample.curseduca?.groupId || 'N/A'}`);
    }

    // Verificar se há algum campo único
    console.log('\n📊 Verificando campos únicos para identificar estes grupos...\n');

    // Agrupar por groupId
    const byGroupId = await usersCol.aggregate([
      {
        $match: {
          'curseduca.groupName': /Clareza/i
        }
      },
      {
        $group: {
          _id: '$curseduca.groupId',
          groupName: { $first: '$curseduca.groupName' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('Por groupId:');
    byGroupId.forEach(g => {
      console.log(`   ${g._id}: ${g.groupName} - ${g.count} membros`);
    });

    await client.close();

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

checkRealGroups();
