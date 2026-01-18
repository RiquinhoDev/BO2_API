// Verificar estado da BD antes do sync
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkBD() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    const usersCol = db.collection('users');
    const userProductsCol = db.collection('userproducts');
    const classesCol = db.collection('classes');

    console.log('📊 ESTADO DA BD ANTES DO SYNC\n');
    console.log('═'.repeat(70));

    // 1. USERS
    console.log('\n👥 USERS:\n');

    const totalUsers = await usersCol.countDocuments({});
    console.log(`   Total de users na BD: ${totalUsers}`);

    const usersWithCurseduca = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true }
    });
    console.log(`   Users com dados CursEduca: ${usersWithCurseduca}`);

    const usersWithEnrolledClasses = await usersCol.countDocuments({
      'curseduca.enrolledClasses': { $exists: true, $ne: [] }
    });
    console.log(`   Users com enrolledClasses: ${usersWithEnrolledClasses}`);

    // Sample de um user
    const sampleUser = await usersCol.findOne({
      email: { $exists: true }
    }, {
      projection: { email: 1, curseduca: 1 }
    });

    console.log(`\n   📋 Sample de 1 user:`);
    console.log(`      email: ${sampleUser?.email}`);
    console.log(`      curseduca: ${JSON.stringify(sampleUser?.curseduca || null)}`);

    // 2. USERPRODUCTS
    console.log('\n\n📦 USERPRODUCTS:\n');

    const totalUserProducts = await userProductsCol.countDocuments({});
    console.log(`   Total de UserProducts: ${totalUserProducts}`);

    const curseducaUserProducts = await userProductsCol.countDocuments({
      platform: 'curseduca'
    });
    console.log(`   UserProducts CursEduca: ${curseducaUserProducts}`);

    // Por plataforma
    const platforms = await userProductsCol.distinct('platform');
    console.log(`\n   Plataformas existentes: ${platforms.join(', ')}`);

    for (const platform of platforms) {
      const count = await userProductsCol.countDocuments({ platform });
      console.log(`      ${platform}: ${count} UserProducts`);
    }

    // 3. CLASSES (Clareza)
    console.log('\n\n📚 TURMAS CLAREZA:\n');

    const clarezaClasses = await classesCol.find({
      name: /Clareza/i
    }).sort({ classId: 1 }).toArray();

    for (const turma of clarezaClasses) {
      console.log(`   ${turma.name}`);
      console.log(`      _id: ${turma._id}`);
      console.log(`      classId: ${turma.classId}`);
      console.log(`      source: ${turma.source}`);
      console.log(`      studentCount: ${turma.studentCount}`);
      console.log(`      isActive: ${turma.isActive}`);
      console.log('');
    }

    // 4. VERIFICAR PRODUTOS
    console.log('📦 PRODUTOS (Product collection):\n');

    const productsCol = db.collection('products');
    const clarezaProducts = await productsCol.find({
      $or: [
        { name: /Clareza/i },
        { productCode: /CLAREZA/i }
      ]
    }).toArray();

    if (clarezaProducts.length > 0) {
      clarezaProducts.forEach(p => {
        console.log(`   ${p.name || p.productCode}`);
        console.log(`      _id: ${p._id}`);
        console.log(`      productCode: ${p.productCode}`);
        console.log(`      platform: ${p.platform}`);
        console.log('');
      });
    } else {
      console.log('   ⚠️  Nenhum produto Clareza encontrado\n');
    }

    console.log('═'.repeat(70));
    console.log('\n✅ Verificação completa!\n');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkBD();
