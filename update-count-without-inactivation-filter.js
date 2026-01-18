// Atualizar studentCount SEM filtro de inactivation
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function updateCounts() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const classesCol = db.collection('classes');
    const usersCol = db.collection('users');

    console.log('🔄 ATUALIZANDO studentCount (SEM filtro inactivation)\n');

    const turmas = [
      { _id: new ObjectId('69657f4ffec024044d623314'), classId: '6', name: 'Clareza - Mensal' },
      { _id: new ObjectId('69657f4cfec024044d622ec6'), classId: '7', name: 'Clareza - Anual' }
    ];

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name}`);

      // Contar TODOS os membros ACTIVE (sem filtro inactivation)
      const count = await usersCol.countDocuments({
        'curseduca.groupId': turma.classId,
        'curseduca.memberStatus': 'ACTIVE'
      });

      console.log(`   Membros ACTIVE: ${count}`);

      await classesCol.updateOne(
        { _id: turma._id },
        { $set: { studentCount: count } }
      );

      console.log(`   ✅ studentCount atualizado para ${count}`);
    }

    // Verificação
    console.log('\n📊 VERIFICAÇÃO:\n');
    const updated = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    updated.forEach(cls => {
      console.log(`${cls.name}: ${cls.studentCount} alunos`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

updateCounts();
