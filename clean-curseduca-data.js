// Script para limpar TODOS os dados do CursEduca da BD
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function cleanCurseducaData() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    console.log('🧹 LIMPEZA COMPLETA DE DADOS CURSEDUCA\n');
    console.log('⚠️  ISTO VAI APAGAR:');
    console.log('   1. Todos os UserProducts da plataforma "curseduca"');
    console.log('   2. Dados curseduca.* de todos os users');
    console.log('   3. StudentCount das turmas Clareza');
    console.log('   4. Histórico de sync do CursEduca\n');

    console.log('═'.repeat(70));
    console.log('📊 ESTADO ANTES DA LIMPEZA:\n');

    // Ver estado atual
    const usersCol = db.collection('users');
    const userProductsCol = db.collection('userproducts');
    const classesCol = db.collection('classes');
    const syncHistoryCol = db.collection('synchistories');

    const usersWithCurseduca = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true }
    });

    const userProductsCurseduca = await userProductsCol.countDocuments({
      platform: 'curseduca'
    });

    const clarezaClasses = await classesCol.find({
      name: /Clareza/i
    }).toArray();

    console.log(`👥 Users com dados CursEduca: ${usersWithCurseduca}`);
    console.log(`📦 UserProducts CursEduca: ${userProductsCurseduca}`);
    console.log(`📚 Turmas Clareza:`);
    clarezaClasses.forEach(c => {
      console.log(`   - ${c.name}: ${c.studentCount} alunos`);
    });

    console.log('\n═'.repeat(70));
    console.log('🔥 INICIANDO LIMPEZA...\n');

    // 1. DELETAR UserProducts CursEduca
    console.log('1️⃣  Deletando UserProducts CursEduca...');
    const deleteUserProducts = await userProductsCol.deleteMany({
      platform: 'curseduca'
    });
    console.log(`   ✅ ${deleteUserProducts.deletedCount} UserProducts deletados\n`);

    // 2. LIMPAR dados curseduca dos users
    console.log('2️⃣  Limpando dados curseduca.* dos users...');
    const updateUsers = await usersCol.updateMany(
      { 'curseduca': { $exists: true } },
      { $unset: { curseduca: "" } }
    );
    console.log(`   ✅ ${updateUsers.modifiedCount} users limpos\n`);

    // 3. RESETAR studentCount das turmas Clareza
    console.log('3️⃣  Resetando studentCount das turmas Clareza...');
    const updateClasses = await classesCol.updateMany(
      { name: /Clareza/i },
      { $set: { studentCount: 0 } }
    );
    console.log(`   ✅ ${updateClasses.modifiedCount} turmas resetadas\n`);

    // 4. LIMPAR histórico de sync
    console.log('4️⃣  Limpando histórico de sync CursEduca...');
    const deleteSyncHistory = await syncHistoryCol.deleteMany({
      platform: 'curseduca'
    });
    console.log(`   ✅ ${deleteSyncHistory.deletedCount} registos de sync deletados\n`);

    console.log('═'.repeat(70));
    console.log('📊 ESTADO APÓS LIMPEZA:\n');

    const usersWithCurseducaAfter = await usersCol.countDocuments({
      'curseduca.groupId': { $exists: true }
    });

    const userProductsCurseducaAfter = await userProductsCol.countDocuments({
      platform: 'curseduca'
    });

    const clarezaClassesAfter = await classesCol.find({
      name: /Clareza/i
    }).toArray();

    console.log(`👥 Users com dados CursEduca: ${usersWithCurseducaAfter}`);
    console.log(`📦 UserProducts CursEduca: ${userProductsCurseducaAfter}`);
    console.log(`📚 Turmas Clareza:`);
    clarezaClassesAfter.forEach(c => {
      console.log(`   - ${c.name}: ${c.studentCount} alunos`);
    });

    console.log('\n═'.repeat(70));
    console.log('✅ LIMPEZA COMPLETA!\n');
    console.log('🚀 Agora podes correr o sync como se fosse a primeira vez:');
    console.log('   curl -X GET "http://localhost:3001/api/curseduca/sync/universal"\n');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

cleanCurseducaData();
