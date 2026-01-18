// Script para encontrar TODOS os grupos Clareza
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function findAllClarezaGroups() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    console.log('✅ Conectado!\n');

    const db = client.db();
    const usersCol = db.collection('users');

    console.log('🔍 PROCURANDO TODOS OS GRUPOS "CLAREZA" NO CURSEDUCA\n');
    console.log('='.repeat(70));

    // Encontrar todos os groupNames únicos que contêm "Clareza"
    const groups = await usersCol.aggregate([
      {
        $match: {
          'curseduca.groupName': /Clareza/i
        }
      },
      {
        $group: {
          _id: {
            groupName: '$curseduca.groupName',
            groupCurseducaUuid: '$curseduca.groupCurseducaUuid',
            groupCurseducaId: '$curseduca.groupCurseducaId'
          },
          totalMembers: { $sum: 1 },
          activeMembers: {
            $sum: {
              $cond: [{ $eq: ['$curseduca.memberStatus', 'ACTIVE'] }, 1, 0]
            }
          },
          notManuallyInactivated: {
            $sum: {
              $cond: [{ $ne: ['$inactivation.isManuallyInactivated', true] }, 1, 0]
            }
          }
        }
      },
      { $sort: { totalMembers: -1 } }
    ]).toArray();

    console.log(`\nEncontrados ${groups.length} grupos diferentes:\n`);

    for (const group of groups) {
      console.log(`📌 ${group._id.groupName}`);
      console.log(`   ├─ UUID: ${group._id.groupCurseducaUuid || 'N/A'}`);
      console.log(`   ├─ ID: ${group._id.groupCurseducaId || 'N/A'}`);
      console.log(`   ├─ Total membros: ${group.totalMembers}`);
      console.log(`   ├─ Membros ACTIVE: ${group.activeMembers}`);
      console.log(`   └─ Não inativados manualmente: ${group.notManuallyInactivated}`);
      console.log('');
    }

    // Também procurar nos enrolledClasses
    console.log('\n📚 PROCURANDO EM enrolledClasses\n');
    console.log('='.repeat(70));

    const enrolledClasses = await usersCol.aggregate([
      { $unwind: '$curseduca.enrolledClasses' },
      {
        $match: {
          'curseduca.enrolledClasses.className': /Clareza/i
        }
      },
      {
        $group: {
          _id: {
            className: '$curseduca.enrolledClasses.className',
            classId: '$curseduca.enrolledClasses.classId',
            curseducaUuid: '$curseduca.enrolledClasses.curseducaUuid',
            curseducaId: '$curseduca.enrolledClasses.curseducaId'
          },
          totalStudents: { $sum: 1 },
          activeStudents: {
            $sum: {
              $cond: [{ $eq: ['$curseduca.enrolledClasses.isActive', true] }, 1, 0]
            }
          }
        }
      },
      { $sort: { totalStudents: -1 } }
    ]).toArray();

    console.log(`\nEncontradas ${enrolledClasses.length} turmas em enrolledClasses:\n`);

    for (const cls of enrolledClasses) {
      console.log(`📚 ${cls._id.className}`);
      console.log(`   ├─ classId: ${cls._id.classId || 'N/A'}`);
      console.log(`   ├─ UUID: ${cls._id.curseducaUuid || 'N/A'}`);
      console.log(`   ├─ ID: ${cls._id.curseducaId || 'N/A'}`);
      console.log(`   ├─ Total estudantes: ${cls.totalStudents}`);
      console.log(`   └─ Estudantes ativos: ${cls.activeStudents}`);
      console.log('');
    }

    console.log('\n✅ Busca concluída!');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

findAllClarezaGroups();
