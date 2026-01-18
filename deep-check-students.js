// Script para investigação profunda dos alunos Clareza
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function deepCheck() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const usersCol = db.collection('users');

    const turmas = [
      { name: 'Clareza - Mensal', uuid: 'e0e74523-a8f7-41dd-9813-a557ee51d46b', classId: '6', expected: 168 },
      { name: 'Clareza - Anual', uuid: '7b1232b0-d03f-499e-8f49-b7750bb75c52', classId: '7', expected: 133 }
    ];

    console.log('🔍 INVESTIGAÇÃO PROFUNDA DE ALUNOS\n');
    console.log('='.repeat(70));

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name}`);
      console.log(`   UUID esperado: ${turma.uuid}`);
      console.log(`   Alunos esperados: ~${turma.expected}\n`);

      // 1. Todos os alunos com esse UUID (sem filtros)
      const allWithUuid = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid
      });
      console.log(`   1️⃣ Total com groupCurseducaUuid: ${allWithUuid}`);

      // 2. Com memberStatus ACTIVE
      const activeMembers = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'curseduca.memberStatus': 'ACTIVE'
      });
      console.log(`   2️⃣ Com memberStatus ACTIVE: ${activeMembers}`);

      // 3. Sem inactivation manual
      const notManuallyInactivated = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'inactivation.isManuallyInactivated': { $ne: true }
      });
      console.log(`   3️⃣ Sem inactivation manual: ${notManuallyInactivated}`);

      // 4. Combinando filtros (query atual)
      const currentQuery = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'curseduca.memberStatus': 'ACTIVE',
        'inactivation.isManuallyInactivated': { $ne: true }
      });
      console.log(`   4️⃣ Query atual (ACTIVE + não inativados): ${currentQuery}`);

      // 5. Verificar valores de memberStatus
      const statusBreakdown = await usersCol.aggregate([
        { $match: { 'curseduca.groupCurseducaUuid': turma.uuid } },
        { $group: {
            _id: '$curseduca.memberStatus',
            count: { $sum: 1 }
        }},
        { $sort: { count: -1 } }
      ]).toArray();

      console.log(`\n   📊 Breakdown por memberStatus:`);
      statusBreakdown.forEach(s => {
        console.log(`      ${s._id || 'null/undefined'}: ${s.count} alunos`);
      });

      // 6. Verificar inactivation
      const inactivationBreakdown = await usersCol.aggregate([
        { $match: { 'curseduca.groupCurseducaUuid': turma.uuid } },
        { $group: {
            _id: '$inactivation.isManuallyInactivated',
            count: { $sum: 1 }
        }}
      ]).toArray();

      console.log(`\n   📊 Breakdown por inactivation:`);
      inactivationBreakdown.forEach(s => {
        console.log(`      isManuallyInactivated=${s._id}: ${s.count} alunos`);
      });

      // 7. Verificar combined.status
      const combinedStatusBreakdown = await usersCol.aggregate([
        { $match: { 'curseduca.groupCurseducaUuid': turma.uuid } },
        { $group: {
            _id: '$combined.status',
            count: { $sum: 1 }
        }},
        { $sort: { count: -1 } }
      ]).toArray();

      console.log(`\n   📊 Breakdown por combined.status:`);
      combinedStatusBreakdown.forEach(s => {
        console.log(`      ${s._id || 'null/undefined'}: ${s.count} alunos`);
      });

      // 8. Exemplos de alunos que NÃO estão sendo contados
      const notCounted = await usersCol.find({
        'curseduca.groupCurseducaUuid': turma.uuid,
        $or: [
          { 'curseduca.memberStatus': { $ne: 'ACTIVE' } },
          { 'inactivation.isManuallyInactivated': true }
        ]
      }).limit(10).toArray();

      if (notCounted.length > 0) {
        console.log(`\n   ⚠️  Exemplos de alunos NÃO contados (${notCounted.length} de ${allWithUuid - currentQuery}):`);
        notCounted.slice(0, 5).forEach(s => {
          console.log(`      - ${s.name || 'N/A'} (${s.email})`);
          console.log(`        memberStatus: ${s.curseduca?.memberStatus}`);
          console.log(`        isManuallyInactivated: ${s.inactivation?.isManuallyInactivated || false}`);
          console.log(`        combined.status: ${s.combined?.status}`);
        });
      }

      // 9. Tentar queries alternativas
      console.log(`\n   🔬 Queries alternativas:`);

      // Sem filtro de memberStatus
      const withoutMemberStatus = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'inactivation.isManuallyInactivated': { $ne: true }
      });
      console.log(`      Sem filtro memberStatus: ${withoutMemberStatus}`);

      // Sem filtro de inactivation
      const withoutInactivation = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'curseduca.memberStatus': 'ACTIVE'
      });
      console.log(`      Sem filtro inactivation: ${withoutInactivation}`);

      // Usando combined.status
      const usingCombined = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'combined.status': 'ACTIVE',
        'inactivation.isManuallyInactivated': { $ne: true }
      });
      console.log(`      Usando combined.status ACTIVE: ${usingCombined}`);

      console.log(`\n   ✅ RECOMENDAÇÃO:`);
      const bestCount = Math.max(currentQuery, withoutMemberStatus, withoutInactivation, usingCombined);
      console.log(`      Melhor contagem encontrada: ${bestCount}`);

      if (bestCount === withoutMemberStatus) {
        console.log(`      💡 Remover filtro de memberStatus!`);
      } else if (bestCount === withoutInactivation) {
        console.log(`      💡 Remover filtro de inactivation!`);
      } else if (bestCount === usingCombined) {
        console.log(`      💡 Usar combined.status em vez de memberStatus!`);
      }
    }

    console.log('\n\n✅ Investigação concluída!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

deepCheck();
