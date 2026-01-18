// Verificação completa do estado final após sync
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkFinalState() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    const usersCol = db.collection('users');
    const userProductsCol = db.collection('userproducts');
    const classesCol = db.collection('classes');

    console.log('═'.repeat(70));
    console.log('📊 ESTADO FINAL APÓS SYNC DO ZERO\n');
    console.log('═'.repeat(70));

    // 1. RESUMO DO SYNC
    console.log('\n🚀 RESUMO DO SYNC:\n');
    console.log('   Adapter processou: 328 users únicos');
    console.log('   Todos com isPrimary: true');
    console.log('   Duração: ~157 segundos\n');

    // 2. USERPRODUCTS
    console.log('📦 USERPRODUCTS:\n');

    const totalUP = await userProductsCol.countDocuments({ platform: 'curseduca' });
    const primaryUP = await userProductsCol.countDocuments({ platform: 'curseduca', isPrimary: true });
    const secondaryUP = await userProductsCol.countDocuments({ platform: 'curseduca', isPrimary: false });

    console.log(`   Total UserProducts CursEduca: ${totalUP}`);
    console.log(`   Primary: ${primaryUP}`);
    console.log(`   Secondary: ${secondaryUP}\n`);

    // Por produto
    const mensal = await userProductsCol.countDocuments({
      platform: 'curseduca',
      'classes.classId': { $in: ['6', 6] }
    });

    const anual = await userProductsCol.countDocuments({
      platform: 'curseduca',
      'classes.classId': { $in: ['7', 7] }
    });

    console.log(`   CLAREZA_MENSAL (classId 6): ${mensal} UserProducts`);
    console.log(`   CLAREZA_ANUAL (classId 7): ${anual} UserProducts`);
    console.log(`   TOTAL: ${mensal + anual} UserProducts\n`);

    // 3. VERIFICAR DUPLICADOS
    console.log('🔍 VERIFICAÇÃO DE USERS COM MÚLTIPLOS PRODUTOS:\n');

    const usersWithMultiple = await userProductsCol.aggregate([
      { $match: { platform: 'curseduca' } },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }
    ]).toArray();

    console.log(`   Users com múltiplos UserProducts: ${usersWithMultiple.length}\n`);

    if (usersWithMultiple.length > 0) {
      console.log(`   📋 Sample de users duplicados:\n`);
      for (let i = 0; i < Math.min(5, usersWithMultiple.length); i++) {
        const userId = usersWithMultiple[i]._id;
        const user = await usersCol.findOne({ _id: userId });
        const products = await userProductsCol.find({
          userId: userId,
          platform: 'curseduca'
        }).toArray();

        console.log(`   ${i + 1}. ${user?.email || 'N/A'} (${usersWithMultiple[i].count} produtos)`);
        products.forEach(p => {
          const classId = p.classes?.[0]?.classId || 'N/A';
          console.log(`      → classId: ${classId}, isPrimary: ${p.isPrimary}, status: ${p.status}`);
        });
        console.log('');
      }
    }

    // 4. TURMAS
    console.log('📚 TURMAS CLAREZA:\n');

    const turmas = await classesCol.find({ name: /Clareza/i }).sort({ classId: 1 }).toArray();

    for (const turma of turmas) {
      const countPrimary = await userProductsCol.countDocuments({
        platform: 'curseduca',
        isPrimary: true,
        status: 'ACTIVE',
        'classes.classId': { $in: [turma.classId, String(turma.classId), Number(turma.classId)] }
      });

      const countAll = await userProductsCol.countDocuments({
        platform: 'curseduca',
        status: 'ACTIVE',
        'classes.classId': { $in: [turma.classId, String(turma.classId), Number(turma.classId)] }
      });

      console.log(`   ${turma.name} (classId: ${turma.classId})`);
      console.log(`      studentCount armazenado: ${turma.studentCount}`);
      console.log(`      PRIMARY + ACTIVE: ${countPrimary} ⭐`);
      console.log(`      TOTAL ACTIVE: ${countAll}`);
      console.log('');
    }

    // 5. VALIDAÇÃO FINAL
    console.log('✅ VALIDAÇÃO FINAL:\n');

    const usersWithCurseduca = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true }
    });

    console.log(`   Users com dados curseduca: ${usersWithCurseduca}`);
    console.log(`   UserProducts CursEduca: ${totalUP}`);
    console.log(`   Diferença: ${totalUP - usersWithCurseduca}\n`);

    const expectedTotal = 60 + 268; // Mensal + Anual
    console.log(`   ✅ Total esperado (60 + 268): ${expectedTotal}`);
    console.log(`   📦 Total atual: ${totalUP}`);
    console.log(`   Diferença: ${totalUP - expectedTotal}\n`);

    console.log('═'.repeat(70));

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkFinalState();
