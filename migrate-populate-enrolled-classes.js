// MIGRAÇÃO: Popular enrolledClasses para users que já têm groupId
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function migrateEnrolledClasses() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();
    const usersCol = db.collection('users');

    console.log('🔄 MIGRAÇÃO: Popular enrolledClasses baseado em groupId\n');
    console.log('='.repeat(70));

    // 1. Contar quantos users precisam de migração
    const needsMigration = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true },
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] },
        { 'curseduca.enrolledClasses': null }
      ]
    });

    console.log(`\n📊 Users que precisam de migração: ${needsMigration}`);

    if (needsMigration === 0) {
      console.log('✅ Nenhum user precisa de migração!');
      return;
    }

    // 2. Buscar todos os users que precisam de migração
    const usersToMigrate = await usersCol.find({
      'curseduca.groupId': { $exists: true },
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] },
        { 'curseduca.enrolledClasses': null }
      ]
    }).toArray();

    console.log(`\n🔄 Iniciando migração de ${usersToMigrate.length} users...\n`);

    let migrated = 0;
    let errors = 0;

    for (const user of usersToMigrate) {
      try {
        const groupId = user.curseduca.groupId;
        const groupName = user.curseduca.groupName || `Grupo ${groupId}`;
        const joinedDate = user.curseduca.joinedDate || user.metadata?.createdAt || new Date();

        // Criar enrolledClass baseado no groupId
        const enrolledClass = {
          classId: String(groupId),
          className: groupName,
          curseducaId: String(groupId),
          curseducaUuid: String(groupId), // Usar groupId como UUID (grupos Clareza)
          enteredAt: joinedDate,
          expiresAt: null,
          isActive: true,
          role: 'student'
        };

        // Atualizar user
        await usersCol.updateOne(
          { _id: user._id },
          { $set: { 'curseduca.enrolledClasses': [enrolledClass] } }
        );

        migrated++;

        if (migrated % 50 === 0) {
          console.log(`   ⏳ Migrados: ${migrated}/${usersToMigrate.length}`);
        }

      } catch (err) {
        console.error(`   ❌ Erro ao migrar ${user.email}:`, err.message);
        errors++;
      }
    }

    console.log(`\n✅ MIGRAÇÃO COMPLETA!\n`);
    console.log(`   ✅ Migrados: ${migrated}`);
    console.log(`   ❌ Erros: ${errors}`);

    // 3. Verificar resultado
    console.log(`\n📊 VERIFICAÇÃO PÓS-MIGRAÇÃO:\n`);

    const withEnrolledClasses = await usersCol.countDocuments({
      'curseduca.enrolledClasses': { $exists: true, $ne: [] }
    });

    const withoutEnrolledClasses = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true },
      $or: [
        { 'curseduca.enrolledClasses': { $exists: false } },
        { 'curseduca.enrolledClasses': [] }
      ]
    });

    console.log(`   Com enrolledClasses: ${withEnrolledClasses}`);
    console.log(`   Sem enrolledClasses: ${withoutEnrolledClasses}`);

    // 4. Verificar grupos 6 e 7
    console.log(`\n📊 VERIFICAÇÃO GRUPOS 6 E 7:\n`);

    const grupo6 = await usersCol.countDocuments({
      'curseduca.enrolledClasses': {
        $elemMatch: {
          curseducaId: { $in: ['6', 6] },
          isActive: true
        }
      }
    });

    const grupo7 = await usersCol.countDocuments({
      'curseduca.enrolledClasses': {
        $elemMatch: {
          curseducaId: { $in: ['7', 7] },
          isActive: true
        }
      }
    });

    console.log(`   Grupo 6 (Clareza Mensal): ${grupo6} alunos`);
    console.log(`   Grupo 7 (Clareza Anual): ${grupo7} alunos`);

    // Amostra de 3 users
    console.log(`\n📋 AMOSTRA DE 3 USERS:\n`);

    const samples = await usersCol.find({
      'curseduca.enrolledClasses': { $exists: true, $ne: [] }
    }).limit(3).toArray();

    samples.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
      console.log(`   groupId: ${user.curseduca?.groupId}`);
      console.log(`   groupName: ${user.curseduca?.groupName}`);
      console.log(`   enrolledClasses: ${user.curseduca?.enrolledClasses?.length || 0}`);

      if (user.curseduca?.enrolledClasses && user.curseduca.enrolledClasses.length > 0) {
        user.curseduca.enrolledClasses.forEach(ec => {
          console.log(`      - ${ec.className} (classId: ${ec.classId}, curseducaId: ${ec.curseducaId})`);
        });
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

migrateEnrolledClasses();
