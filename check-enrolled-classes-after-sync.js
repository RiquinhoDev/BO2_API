// Verificar se enrolledClasses foi populado após o sync
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function checkEnrolledClasses() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('📊 VERIFICAÇÃO enrolledClasses APÓS SYNC\n');
    console.log('='.repeat(70));

    // 1. Quantos users têm enrolledClasses?
    const withEnrolled = await usersCol.countDocuments({
      'curseduca.enrolledClasses': { $exists: true, $ne: [] }
    });

    const withoutEnrolled = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true },
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] }
      ]
    });

    console.log(`\n📊 ESTATÍSTICAS enrolledClasses:`);
    console.log(`   Com enrolledClasses: ${withEnrolled}`);
    console.log(`   Sem enrolledClasses: ${withoutEnrolled}`);

    // 2. Contar por grupo usando enrolledClasses
    console.log(`\n📊 CONTAGEM POR enrolledClasses:\n`);

    const grupo6 = await usersCol.countDocuments({
      'curseduca.enrolledClasses': {
        $elemMatch: {
          curseducaId: { $in: ['6', 6] },
          isActive: true
        }
      },
      'curseduca.memberStatus': 'ACTIVE'
    });

    const grupo7 = await usersCol.countDocuments({
      'curseduca.enrolledClasses': {
        $elemMatch: {
          curseducaId: { $in: ['7', 7] },
          isActive: true
        }
      },
      'curseduca.memberStatus': 'ACTIVE'
    });

    console.log(`   Grupo 6 (enrolledClasses + ACTIVE): ${grupo6}`);
    console.log(`   Grupo 7 (enrolledClasses + ACTIVE): ${grupo7}`);
    console.log(`   Total: ${grupo6 + grupo7}`);

    // 3. Ver quantos users têm AMBOS os grupos
    const withBoth = await usersCol.countDocuments({
      'curseduca.enrolledClasses': {
        $all: [
          { $elemMatch: { curseducaId: { $in: ['6', 6] } } },
          { $elemMatch: { curseducaId: { $in: ['7', 7] } } }
        ]
      }
    });

    console.log(`\n⚠️  Users em AMBOS os grupos: ${withBoth}`);

    // 4. Amostra de users
    console.log(`\n📋 AMOSTRA DE 5 USERS:\n`);

    const samples = await usersCol.find({
      'curseduca.enrolledClasses': { $exists: true, $ne: [] }
    }).limit(5).toArray();

    samples.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
      console.log(`   groupId: ${user.curseduca?.groupId}`);
      console.log(`   groupName: ${user.curseduca?.groupName}`);
      console.log(`   enrolledClasses: ${user.curseduca?.enrolledClasses?.length || 0}`);

      if (user.curseduca?.enrolledClasses && user.curseduca.enrolledClasses.length > 0) {
        user.curseduca.enrolledClasses.forEach(ec => {
          console.log(`      - ${ec.className} (ID: ${ec.curseducaId}, active: ${ec.isActive})`);
        });
      }
      console.log('');
    });

    // 5. Comparar com API esperada
    console.log(`\n📊 COMPARAÇÃO COM API CURSEDUCA:\n`);
    console.log(`   Esperado Grupo 6: 168`);
    console.log(`   Encontrado: ${grupo6}`);
    console.log(`   Diferença: ${168 - grupo6}`);
    console.log(``);
    console.log(`   Esperado Grupo 7: 133`);
    console.log(`   Encontrado: ${grupo7}`);
    console.log(`   Diferença: ${133 - grupo7}`);

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

checkEnrolledClasses();
