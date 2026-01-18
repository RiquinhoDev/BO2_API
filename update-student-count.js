// Script para atualizar studentCount das turmas 6 e 7
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function updateStudentCount() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const classesCol = db.collection('classes');
    const usersCol = db.collection('users');

    const turmas = [
      { _id: new ObjectId('69657f4ffec024044d623314'), classId: '6', name: 'Clareza - Mensal', uuid: 'e0e74523-a8f7-41dd-9813-a557ee51d46b' },
      { _id: new ObjectId('69657f4cfec024044d622ec6'), classId: '7', name: 'Clareza - Anual', uuid: '7b1232b0-d03f-499e-8f49-b7750bb75c52' }
    ];

    console.log('🔄 ATUALIZANDO studentCount\n');
    console.log('='.repeat(60));

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name}`);

      // Contar alunos usando o mesmo critério do modelo
      const count = await usersCol.countDocuments({
        'curseduca.groupCurseducaUuid': turma.uuid,
        'curseduca.memberStatus': 'ACTIVE',
        'inactivation.isManuallyInactivated': { $ne: true }
      });

      console.log(`   Alunos encontrados: ${count}`);

      // Atualizar
      const result = await classesCol.updateOne(
        { _id: turma._id },
        { $set: { studentCount: count } }
      );

      if (result.modifiedCount > 0) {
        console.log(`   ✅ studentCount atualizado para ${count}`);
      } else {
        console.log(`   ℹ️  studentCount já era ${count}`);
      }
    }

    // Verificação final
    console.log('\n\n📊 VERIFICAÇÃO FINAL\n');
    console.log('='.repeat(60));

    const clarezaClasses = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    clarezaClasses.forEach(cls => {
      console.log(`\n📌 ${cls.name}`);
      console.log(`   ├─ classId: ${cls.classId}`);
      console.log(`   ├─ source: ${cls.source}`);
      console.log(`   ├─ studentCount: ${cls.studentCount}`);
      console.log(`   └─ curseducaUuid: ${cls.curseducaUuid || 'N/A'}`);
    });

    console.log('\n\n✅ Atualização concluída!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

updateStudentCount();
