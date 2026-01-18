const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkClasses() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const classesCol = db.collection('classes');
    const userProductsCol = db.collection('userproducts');

    console.log('📊 CONTAGEM DE ALUNOS POR TURMA\n');
    console.log('='.repeat(70));

    const turmas = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    for (const turma of turmas) {
      console.log(`\n📚 ${turma.name} (classId: ${turma.classId})`);
      console.log(`   studentCount (armazenado): ${turma.studentCount}`);

      // Contar usando UserProduct com isPrimary=true
      const countPrimary = await userProductsCol.countDocuments({
        platform: 'curseduca',
        isPrimary: true,
        status: 'ACTIVE',
        'classes': {
          $elemMatch: {
            classId: { $in: [turma.classId, String(turma.classId), Number(turma.classId)] }
          }
        }
      });

      console.log(`   UserProducts (PRIMARY + ACTIVE): ${countPrimary}`);

      // Contar TODOS os UserProducts (incluindo não-primary)
      const countAll = await userProductsCol.countDocuments({
        platform: 'curseduca',
        status: 'ACTIVE',
        'classes': {
          $elemMatch: {
            classId: { $in: [turma.classId, String(turma.classId), Number(turma.classId)] }
          }
        }
      });

      console.log(`   UserProducts (TOTAL ACTIVE): ${countAll}`);
    }

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkClasses();
