// Contar quantos grupos CursEduca existem
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function countGroups() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('📊 ANÁLISE DE GRUPOS CURSEDUCA\n');
    console.log('='.repeat(70));

    // Contar por groupId
    const byGroupId = await usersCol.aggregate([
      {
        $match: {
          'curseduca': { $exists: true }
        }
      },
      {
        $group: {
          _id: {
            groupId: '$curseduca.groupId',
            groupName: '$curseduca.groupName'
          },
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ['$curseduca.memberStatus', 'ACTIVE'] }, 1, 0]
            }
          }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    console.log(`\nTotal de grupos diferentes: ${byGroupId.length}\n`);

    byGroupId.forEach(grp => {
      console.log(`📚 ${grp._id.groupName || 'Sem nome'}`);
      console.log(`   groupId: ${grp._id.groupId || 'N/A'}`);
      console.log(`   Total: ${grp.total} | Active: ${grp.active}`);
      console.log('');
    });

    // Total de users com curseduca
    const totalCurseduca = await usersCol.countDocuments({
      'curseduca': { $exists: true }
    });

    console.log(`\n✅ Total de users com dados CursEduca: ${totalCurseduca}`);

    await client.close();

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

countGroups();
