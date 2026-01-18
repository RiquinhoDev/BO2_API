// Correção final: remover UUIDs errados e atualizar studentCount
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function fixFinal() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const classesCol = db.collection('classes');
    const usersCol = db.collection('users');

    console.log('🔧 CORREÇÃO FINAL DAS TURMAS CLAREZA\n');
    console.log('='.repeat(70));

    const turmas = [
      { _id: new ObjectId('69657f4ffec024044d623314'), classId: '6', name: 'Clareza - Mensal' },
      { _id: new ObjectId('69657f4cfec024044d622ec6'), classId: '7', name: 'Clareza - Anual' }
    ];

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name} (classId: ${turma.classId})`);

      // 1. Remover curseducaUuid errado
      console.log(`   1️⃣ Removendo curseducaUuid incorreto...`);
      await classesCol.updateOne(
        { _id: turma._id },
        { $unset: { curseducaUuid: "" } }
      );
      console.log(`   ✅ curseducaUuid removido`);

      // 2. Contar alunos usando groupId
      const count = await usersCol.countDocuments({
        'curseduca.groupId': turma.classId,
        'curseduca.memberStatus': 'ACTIVE',
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      console.log(`   2️⃣ Alunos encontrados por groupId: ${count}`);

      // 3. Atualizar studentCount
      await classesCol.updateOne(
        { _id: turma._id },
        { $set: { studentCount: count } }
      );
      console.log(`   ✅ studentCount atualizado para ${count}`);
    }

    // Verificação final
    console.log('\n\n📊 VERIFICAÇÃO FINAL\n');
    console.log('='.repeat(70));

    const finalClasses = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    for (const cls of finalClasses) {
      console.log(`\n📌 ${cls.name}`);
      console.log(`   ├─ classId: ${cls.classId}`);
      console.log(`   ├─ source: ${cls.source}`);
      console.log(`   ├─ studentCount: ${cls.studentCount}`);
      console.log(`   ├─ curseducaId: ${cls.curseducaId || 'N/A'}`);
      console.log(`   └─ curseducaUuid: ${cls.curseducaUuid || 'N/A (usa groupId)'}`);
    }

    console.log('\n\n✅ Correção concluída!');
    console.log('\n💡 Agora o sistema usa curseduca.groupId para encontrar alunos');
    console.log('   quando curseducaUuid não está disponível.');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

fixFinal();
