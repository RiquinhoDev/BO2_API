// Diagnosticar problema de enrollment
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function diagnose() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('🔍 DIAGNÓSTICO COMPLETO - ENROLLMENT\n');
    console.log('='.repeat(70));

    // 1. Ver amostra de como os dados estão guardados
    console.log('\n📋 AMOSTRA DE DADOS (3 users com curseduca):\n');

    const samples = await usersCol.find({
      'curseduca': { $exists: true }
    }).limit(3).toArray();

    samples.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
      console.log(`   groupId: ${user.curseduca?.groupId}`);
      console.log(`   groupName: ${user.curseduca?.groupName}`);
      console.log(`   groupCurseducaId: ${user.curseduca?.groupCurseducaId}`);
      console.log(`   groupCurseducaUuid: ${user.curseduca?.groupCurseducaUuid}`);
      console.log(`   memberStatus: ${user.curseduca?.memberStatus}`);
      console.log(`   enrolledClasses: ${user.curseduca?.enrolledClasses?.length || 0}`);

      if (user.curseduca?.enrolledClasses && user.curseduca.enrolledClasses.length > 0) {
        console.log(`   Classes:`);
        user.curseduca.enrolledClasses.forEach(ec => {
          console.log(`      - ${ec.className} (classId: ${ec.classId}, uuid: ${ec.curseducaUuid})`);
        });
      }
      console.log('');
    });

    // 2. Contar quantos users têm enrolledClasses
    const withEnrolled = await usersCol.countDocuments({
      'curseduca.enrolledClasses': { $exists: true, $ne: [] }
    });

    const withoutEnrolled = await usersCol.countDocuments({
      'curseduca': { $exists: true },
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] }
      ]
    });

    console.log(`\n📊 ESTATÍSTICAS enrolledClasses:`);
    console.log(`   Com enrolledClasses: ${withEnrolled}`);
    console.log(`   Sem enrolledClasses: ${withoutEnrolled}`);

    // 3. Ver como deveríamos estar a contar
    console.log(`\n\n🎯 CONTAGEM CORRETA DEVERIA SER:\n`);

    // Por groupId (método atual)
    const byGroupId6 = await usersCol.countDocuments({
      'curseduca.groupId': '6',
      'curseduca.memberStatus': 'ACTIVE'
    });

    const byGroupId7 = await usersCol.countDocuments({
      'curseduca.groupId': '7',
      'curseduca.memberStatus': 'ACTIVE'
    });

    console.log(`📌 Método ATUAL (groupId + ACTIVE):`);
    console.log(`   Grupo 6: ${byGroupId6}`);
    console.log(`   Grupo 7: ${byGroupId7}`);

    // Por enrolledClasses
    const byEnrolled6 = await usersCol.aggregate([
      { $unwind: '$curseduca.enrolledClasses' },
      {
        $match: {
          $or: [
            { 'curseduca.enrolledClasses.classId': '6' },
            { 'curseduca.enrolledClasses.curseducaId': '6' },
            { 'curseduca.enrolledClasses.curseducaId': 6 }
          ],
          'curseduca.enrolledClasses.isActive': true
        }
      },
      { $count: 'total' }
    ]).toArray();

    const byEnrolled7 = await usersCol.aggregate([
      { $unwind: '$curseduca.enrolledClasses' },
      {
        $match: {
          $or: [
            { 'curseduca.enrolledClasses.classId': '7' },
            { 'curseduca.enrolledClasses.curseducaId': '7' },
            { 'curseduca.enrolledClasses.curseducaId': 7 }
          ],
          'curseduca.enrolledClasses.isActive': true
        }
      },
      { $count: 'total' }
    ]).toArray();

    console.log(`\n📌 Por enrolledClasses (isActive):`);
    console.log(`   Grupo 6: ${byEnrolled6[0]?.total || 0}`);
    console.log(`   Grupo 7: ${byEnrolled7[0]?.total || 0}`);

    // Ver se há users em AMBOS os grupos
    const inBoth = await usersCol.countDocuments({
      'curseduca.enrolledClasses': {
        $all: [
          { $elemMatch: { curseducaId: 6 } },
          { $elemMatch: { curseducaId: 7 } }
        ]
      }
    });

    console.log(`\n⚠️  Users em AMBAS as turmas: ${inBoth}`);

    // 4. Verificar problema de duplicação
    console.log(`\n\n🔍 VERIFICANDO PROBLEMA:\n`);

    // Users que estão no grupo 6 mas NÃO têm enrolledClass para grupo 6
    const inGroup6NoEnroll = await usersCol.countDocuments({
      'curseduca.groupId': '6',
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] },
        {
          'curseduca.enrolledClasses': {
            $not: {
              $elemMatch: { curseducaId: { $in: [6, '6'] } }
            }
          }
        }
      ]
    });

    console.log(`❌ Grupo 6: ${inGroup6NoEnroll} users SEM enrolledClass correspondente`);

    const inGroup7NoEnroll = await usersCol.countDocuments({
      'curseduca.groupId': '7',
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] },
        {
          'curseduca.enrolledClasses': {
            $not: {
              $elemMatch: { curseducaId: { $in: [7, '7'] } }
            }
          }
        }
      ]
    });

    console.log(`❌ Grupo 7: ${inGroup7NoEnroll} users SEM enrolledClass correspondente`);

    console.log(`\n\n💡 CONCLUSÃO:`);
    console.log(`   Se há muitos users sem enrolledClass, o problema é no SYNC!`);
    console.log(`   O sync está a guardar groupId mas NÃO os enrolledClasses.`);

    await client.close();

  } catch (error) {
    console.error('❌ Erro:', error);
  }
}

diagnose();
