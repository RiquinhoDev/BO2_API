// Verificar enrolledClasses para encontrar os números corretos
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkEnrolledClasses() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('🔍 PROCURANDO TURMAS COM 168 E 133 MEMBROS\n');
    console.log('='.repeat(70));

    // Procurar TODAS as combinações possíveis de turmas Clareza
    const allClarezaEnrollments = await usersCol.aggregate([
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
            curseducaId: '$curseduca.enrolledClasses.curseducaId',
            curseducaUuid: '$curseduca.enrolledClasses.curseducaUuid'
          },
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ['$curseduca.enrolledClasses.isActive', true] }, 1, 0]
            }
          },
          notManuallyInactivated: {
            $sum: {
              $cond: [{ $ne: ['$inactivation.isManuallyInactivated', true] }, 1, 0]
            }
          }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    console.log(`Encontradas ${allClarezaEnrollments.length} turmas diferentes em enrolledClasses:\n`);

    allClarezaEnrollments.forEach(cls => {
      console.log(`📚 ${cls._id.className}`);
      console.log(`   ├─ classId: ${cls._id.classId || 'N/A'}`);
      console.log(`   ├─ curseducaId: ${cls._id.curseducaId || 'N/A'}`);
      console.log(`   ├─ curseducaUuid: ${cls._id.curseducaUuid || 'N/A'}`);
      console.log(`   ├─ Total membros: ${cls.total}`);
      console.log(`   ├─ Ativos (isActive=true): ${cls.active}`);
      console.log(`   └─ Não inativados manualmente: ${cls.notManuallyInactivated}`);

      if (cls.total === 168 || cls.total === 133 ||
          cls.active === 168 || cls.active === 133 ||
          cls.notManuallyInactivated === 168 || cls.notManuallyInactivated === 133) {
        console.log(`   🎯 MATCH! Este pode ser o número correto!`);
      }
      console.log('');
    });

    // Também verificar por groupName
    console.log('\n📊 POR groupName:\n');

    const byGroupName = await usersCol.aggregate([
      {
        $match: {
          'curseduca.groupName': /Clareza/i
        }
      },
      {
        $group: {
          _id: {
            groupName: '$curseduca.groupName',
            groupId: '$curseduca.groupId',
            groupCurseducaId: '$curseduca.groupCurseducaId',
            groupCurseducaUuid: '$curseduca.groupCurseducaUuid'
          },
          total: { $sum: 1 },
          active: {
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
      { $sort: { total: -1 } }
    ]).toArray();

    byGroupName.forEach(grp => {
      console.log(`👥 ${grp._id.groupName}`);
      console.log(`   ├─ groupId: ${grp._id.groupId || 'N/A'}`);
      console.log(`   ├─ groupCurseducaId: ${grp._id.groupCurseducaId || 'N/A'}`);
      console.log(`   ├─ groupCurseducaUuid: ${grp._id.groupCurseducaUuid || 'N/A'}`);
      console.log(`   ├─ Total membros: ${grp.total}`);
      console.log(`   ├─ Ativos (memberStatus=ACTIVE): ${grp.active}`);
      console.log(`   └─ Não inativados manualmente: ${grp.notManuallyInactivated}`);

      if (grp.total === 168 || grp.total === 133 ||
          grp.active === 168 || grp.active === 133 ||
          grp.notManuallyInactivated === 168 || grp.notManuallyInactivated === 133) {
        console.log(`   🎯 MATCH! Este pode ser o número correto!`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkEnrolledClasses();
