// Contar TODOS os membros (incluindo inativados manualmente)
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function countAll() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('📊 CONTAGEM COMPLETA - TODOS OS MEMBROS\n');
    console.log('='.repeat(70));

    const turmas = [
      { name: 'Clareza - Mensal', groupId: '6', expected: 168 },
      { name: 'Clareza - Anual', groupId: '7', expected: 133 }
    ];

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name} (esperado: ${turma.expected})`);
      console.log(`   groupId: ${turma.groupId}\n`);

      // 1. TODOS os membros (sem filtros)
      const total = await usersCol.countDocuments({
        'curseduca.groupId': turma.groupId
      });
      console.log(`   1️⃣ TODOS os membros: ${total}`);

      // 2. Por memberStatus
      const statusBreakdown = await usersCol.aggregate([
        { $match: { 'curseduca.groupId': turma.groupId } },
        {
          $group: {
            _id: '$curseduca.memberStatus',
            count: { $sum: 1 }
          }
        }
      ]).toArray();

      console.log(`   2️⃣ Por memberStatus:`);
      statusBreakdown.forEach(s => {
        console.log(`      ${s._id || 'null'}: ${s.count}`);
      });

      // 3. Por inactivation
      const active = await usersCol.countDocuments({
        'curseduca.groupId': turma.groupId,
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      const manuallyInactivated = await usersCol.countDocuments({
        'curseduca.groupId': turma.groupId,
        'inactivation.isManuallyInactivated': true
      });

      console.log(`\n   3️⃣ Por inactivation:`);
      console.log(`      Não inativados manualmente: ${active}`);
      console.log(`      Inativados manualmente: ${manuallyInactivated}`);

      // 4. Combinações
      const activeMemberStatus = await usersCol.countDocuments({
        'curseduca.groupId': turma.groupId,
        'curseduca.memberStatus': 'ACTIVE'
      });

      const activeNotManuallyInact = await usersCol.countDocuments({
        'curseduca.groupId': turma.groupId,
        'curseduca.memberStatus': 'ACTIVE',
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      console.log(`\n   4️⃣ Combinações:`);
      console.log(`      memberStatus ACTIVE: ${activeMemberStatus}`);
      console.log(`      ACTIVE + não inativados manualmente: ${activeNotManuallyInact}`);

      // 5. Comparação com esperado
      console.log(`\n   ✅ COMPARAÇÃO:`);
      console.log(`      Esperado: ${turma.expected}`);
      console.log(`      Total encontrado: ${total}`);
      console.log(`      Diferença: ${total - turma.expected}`);

      if (total === turma.expected) {
        console.log(`      🎯 PERFEITO! Usar TODOS os membros (sem filtros)`);
      } else if (activeNotManuallyInact === turma.expected) {
        console.log(`      🎯 PERFEITO! Usar ACTIVE + não inativados`);
      } else {
        console.log(`      ⚠️  Nenhuma query bate com ${turma.expected}`);
      }
    }

    console.log('\n✅ Análise concluída!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

countAll();
