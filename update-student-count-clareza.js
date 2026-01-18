// Atualizar studentCount das turmas Clareza baseado em UserProducts
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function updateStudentCount() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const classesCol = db.collection('classes');
    const userProductsCol = db.collection('userproducts');

    console.log('🔄 ATUALIZANDO STUDENTCOUNT DAS TURMAS CLAREZA\n');
    console.log('═'.repeat(70));

    const turmas = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    for (const turma of turmas) {
      console.log(`\n📚 ${turma.name} (classId: ${turma.classId})`);
      console.log(`   studentCount atual: ${turma.studentCount}`);

      // Contar usando UserProduct com isPrimary=true e status=ACTIVE
      const count = await userProductsCol.countDocuments({
        platform: 'curseduca',
        isPrimary: true,
        status: 'ACTIVE',
        'classes': {
          $elemMatch: {
            classId: { $in: [turma.classId, String(turma.classId), Number(turma.classId)] }
          }
        }
      });

      console.log(`   Contagem real (PRIMARY + ACTIVE): ${count}`);

      // Atualizar
      const result = await classesCol.updateOne(
        { _id: turma._id },
        { $set: { studentCount: count } }
      );

      if (result.modifiedCount > 0) {
        console.log(`   ✅ studentCount atualizado para ${count}`);
      } else {
        console.log(`   ⚠️  Nenhuma alteração (já estava correto)`);
      }
    }

    console.log('\n═'.repeat(70));
    console.log('📊 VERIFICAÇÃO FINAL:\n');

    const updated = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    updated.forEach(cls => {
      console.log(`   ${cls.name}: ${cls.studentCount} alunos`);
    });

    console.log('\n✅ Atualização completa!\n');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

updateStudentCount();
