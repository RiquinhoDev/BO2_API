// Atualizar studentCount usando enrolledClasses (depois da migração)
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

    console.log('🔄 ATUALIZANDO studentCount usando enrolledClasses\n');

    const turmas = [
      { _id: new ObjectId('69657f4ffec024044d623314'), classId: '6', name: 'Clareza - Mensal' },
      { _id: new ObjectId('69657f4cfec024044d622ec6'), classId: '7', name: 'Clareza - Anual' }
    ];

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name}`);

      // Contar usando enrolledClasses array
      const countEnrolled = await usersCol.countDocuments({
        'curseduca.enrolledClasses': {
          $elemMatch: {
            curseducaId: { $in: [turma.classId, String(turma.classId), Number(turma.classId)] },
            isActive: true
          }
        },
        'curseduca.memberStatus': 'ACTIVE'
      });

      console.log(`   📊 Contagem (enrolledClasses + ACTIVE): ${countEnrolled}`);

      // Atualizar studentCount
      await classesCol.updateOne(
        { _id: turma._id },
        { $set: { studentCount: countEnrolled } }
      );

      console.log(`   ✅ studentCount atualizado para ${countEnrolled}`);
    }

    // Verificação final
    console.log('\n📊 VERIFICAÇÃO FINAL:\n');
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
