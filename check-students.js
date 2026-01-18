// Script para verificar alunos após correção
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkStudents() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const usersCol = db.collection('users');

    const uuids = [
      { name: 'Clareza - Mensal', uuid: 'e0e74523-a8f7-41dd-9813-a557ee51d46b', classId: '6' },
      { name: 'Clareza - Anual', uuid: '7b1232b0-d03f-499e-8f49-b7750bb75c52', classId: '7' }
    ];

    console.log('🔍 PROCURANDO ALUNOS\n');
    console.log('='.repeat(60));

    for (const turma of uuids) {
      console.log(`\n📌 ${turma.name}`);
      console.log(`   UUID: ${turma.uuid}`);
      console.log(`   classId: ${turma.classId}\n`);

      // Busca 1: Por groupCurseducaUuid
      const byGroupUuid = await usersCol.find({
        'curseduca.groupCurseducaUuid': turma.uuid
      }).limit(10).toArray();

      console.log(`   ├─ Por groupCurseducaUuid: ${byGroupUuid.length} alunos`);

      if (byGroupUuid.length > 0) {
        console.log(`      Exemplos:`);
        byGroupUuid.slice(0, 5).forEach(s => {
          console.log(`      - ${s.name || 'N/A'} (${s.email})`);
          console.log(`        groupName: ${s.curseduca?.groupName}`);
          console.log(`        memberStatus: ${s.curseduca?.memberStatus}`);
          console.log(`        neverLogged: ${s.curseduca?.neverLogged}`);
        });
      }

      // Busca 2: Por enrolledClasses.curseducaUuid
      const byEnrolledUuid = await usersCol.find({
        'curseduca.enrolledClasses': {
          $elemMatch: { curseducaUuid: turma.uuid }
        }
      }).limit(10).toArray();

      console.log(`\n   ├─ Por enrolledClasses.curseducaUuid: ${byEnrolledUuid.length} alunos`);

      if (byEnrolledUuid.length > 0) {
        console.log(`      Exemplos:`);
        byEnrolledUuid.slice(0, 5).forEach(s => {
          console.log(`      - ${s.name || 'N/A'} (${s.email})`);
          const enrolledClass = s.curseduca?.enrolledClasses?.find(ec => ec.curseducaUuid === turma.uuid);
          if (enrolledClass) {
            console.log(`        className: ${enrolledClass.className}`);
            console.log(`        isActive: ${enrolledClass.isActive}`);
            console.log(`        role: ${enrolledClass.role}`);
          }
        });
      }

      // Busca 3: Total com qualquer critério
      const total = await usersCol.countDocuments({
        $or: [
          { 'curseduca.groupCurseducaUuid': turma.uuid },
          { 'curseduca.enrolledClasses.curseducaUuid': turma.uuid },
          { 'curseduca.enrolledClasses.classId': turma.classId },
          { classId: turma.classId }
        ]
      });

      console.log(`\n   └─ TOTAL (todos os critérios): ${total} alunos`);
    }

    console.log('\n\n✅ Verificação concluída!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkStudents();
