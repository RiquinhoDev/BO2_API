// Atualizar studentCount usando UserProduct com isPrimary=true
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function updateCounts() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const classesCol = db.collection('classes');
    const userProductsCol = db.collection('userproducts');

    console.log('🔄 ATUALIZANDO studentCount (isPrimary=true)\n');

    const turmas = [
      { _id: new ObjectId('69657f4ffec024044d623314'), classId: '6', name: 'Clareza - Mensal' },
      { _id: new ObjectId('69657f4cfec024044d622ec6'), classId: '7', name: 'Clareza - Anual' }
    ];

    for (const turma of turmas) {
      console.log(`\n📌 ${turma.name}`);

      // Contar usando UserProduct PRIMARY + ACTIVE
      const count = await userProductsCol.countDocuments({
        platform: 'curseduca',
        isPrimary: true,
        status: 'ACTIVE',
        'classes': {
          $elemMatch: {
            classId: { $in: [turma.classId, Number(turma.classId)] }
          }
        }
      });

      console.log(`   📊 UserProducts (PRIMARY + ACTIVE): ${count}`);

      // Atualizar
      await classesCol.updateOne(
        { _id: turma._id },
        { $set: { studentCount: count } }
      );

      console.log(`   ✅ studentCount atualizado para ${count}`);
    }

    // Verificação final
    console.log('\n📊 VERIFICAÇÃO FINAL:\n');
    const updated = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    updated.forEach(cls => {
      console.log(`${cls.name}: ${cls.studentCount} alunos`);
    });

    console.log('\n✅ Concluído!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

updateCounts();
