// Verificar user específico que deveria ter 2 grupos
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkUser() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');
    const userProductsCol = db.collection('userproducts');

    // Users que sabemos ter 2 grupos
    const emails = [
      'meneseshenrique78@gmail.com',
      'ricjcrod@gmail.com',
      'jpedro1983@gmail.com',
      'sabino_hugo_13@hotmail.com'
    ];

    for (const email of emails) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📧 ${email}\n`);

      const user = await usersCol.findOne({ email });

      if (!user) {
        console.log('❌ User não encontrado');
        continue;
      }

      console.log(`📊 User.curseduca:`);
      console.log(`   groupId: ${user.curseduca?.groupId}`);
      console.log(`   groupName: ${user.curseduca?.groupName}`);
      console.log(`   enrolledClasses: ${user.curseduca?.enrolledClasses?.length || 0}`);

      if (user.curseduca?.enrolledClasses) {
        user.curseduca.enrolledClasses.forEach((ec, i) => {
          console.log(`   ${i + 1}. ${ec.className} (ID: ${ec.curseducaId}, active: ${ec.isActive})`);
        });
      }

      // Verificar UserProducts
      const userProducts = await userProductsCol.find({
        userId: user._id,
        platform: 'curseduca'
      }).toArray();

      console.log(`\n📦 UserProducts: ${userProducts.length}`);
      userProducts.forEach((up, i) => {
        const classIds = up.classes?.map(c => c.classId).join(', ') || 'N/A';
        console.log(`   ${i + 1}. classId: ${classIds}, isPrimary: ${up.isPrimary}, status: ${up.status}`);
      });
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkUser();
