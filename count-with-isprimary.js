// Contar students usando UserProduct com isPrimary=true
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function countWithIsPrimary() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const userProductsCol = db.collection('userproducts');

    console.log('📊 CONTAGEM COM isPrimary=true\n');
    console.log('='.repeat(70));

    // Grupo 6 - Clareza Mensal
    console.log('\n📌 Grupo 6 (Clareza - Mensal):\n');

    const count6 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      isPrimary: true,
      status: 'ACTIVE',
      'classes': {
        $elemMatch: {
          classId: { $in: ['6', 6] }
        }
      }
    });

    console.log(`   ✅ UserProducts PRIMARY + ACTIVE: ${count6}`);

    // Detalhes
    const all6 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      status: 'ACTIVE',
      'classes': {
        $elemMatch: {
          classId: { $in: ['6', 6] }
        }
      }
    });

    const primary6 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      isPrimary: true,
      'classes': {
        $elemMatch: {
          classId: { $in: ['6', 6] }
        }
      }
    });

    const secondary6 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      isPrimary: false,
      'classes': {
        $elemMatch: {
          classId: { $in: ['6', 6] }
        }
      }
    });

    console.log(`   📊 Total UserProducts: ${all6}`);
    console.log(`   📌 PRIMARY: ${primary6}`);
    console.log(`   🔻 SECONDARY: ${secondary6}`);

    // Grupo 7 - Clareza Anual
    console.log('\n📌 Grupo 7 (Clareza - Anual):\n');

    const count7 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      isPrimary: true,
      status: 'ACTIVE',
      'classes': {
        $elemMatch: {
          classId: { $in: ['7', 7] }
        }
      }
    });

    console.log(`   ✅ UserProducts PRIMARY + ACTIVE: ${count7}`);

    // Detalhes
    const all7 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      status: 'ACTIVE',
      'classes': {
        $elemMatch: {
          classId: { $in: ['7', 7] }
        }
      }
    });

    const primary7 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      isPrimary: true,
      'classes': {
        $elemMatch: {
          classId: { $in: ['7', 7] }
        }
      }
    });

    const secondary7 = await userProductsCol.countDocuments({
      platform: 'curseduca',
      isPrimary: false,
      'classes': {
        $elemMatch: {
          classId: { $in: ['7', 7] }
        }
      }
    });

    console.log(`   📊 Total UserProducts: ${all7}`);
    console.log(`   📌 PRIMARY: ${primary7}`);
    console.log(`   🔻 SECONDARY: ${secondary7}`);

    // Totais
    console.log('\n📊 TOTAIS:\n');
    console.log(`   Total de users ÚNICOS: ${count6 + count7}`);
    console.log(`   (Grupo 6: ${count6} + Grupo 7: ${count7})`);

    // Verificar quantos users têm AMBOS os produtos
    console.log('\n🔍 USERS COM MÚLTIPLOS PRODUTOS:\n');

    const usersWithBoth = await userProductsCol.aggregate([
      {
        $match: {
          platform: 'curseduca',
          'classes.classId': { $in: ['6', '7', 6, 7] }
        }
      },
      {
        $group: {
          _id: '$userId',
          products: { $push: '$$ROOT' },
          count: { $sum: 1 }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]).toArray();

    console.log(`   Users com múltiplos produtos Clareza: ${usersWithBoth.length}`);

    // Mostrar exemplos
    if (usersWithBoth.length > 0) {
      console.log('\n   📋 Exemplos (primeiros 5):');
      for (let i = 0; i < Math.min(5, usersWithBoth.length); i++) {
        const u = usersWithBoth[i];
        const userId = u._id;

        // Buscar email do user
        const usersCol = db.collection('users');
        const user = await usersCol.findOne({ _id: userId });

        console.log(`\n   ${i + 1}. ${user?.email || 'N/A'}`);
        console.log(`      Produtos: ${u.count}`);

        u.products.forEach((p, idx) => {
          const classIds = p.classes?.map(c => c.classId).join(', ') || 'N/A';
          console.log(`      ${idx + 1}) classId: ${classIds}, isPrimary: ${p.isPrimary}, status: ${p.status}`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

countWithIsPrimary();
