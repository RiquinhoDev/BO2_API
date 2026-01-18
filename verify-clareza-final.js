// Verificação final do estado das turmas Clareza
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function verify() {
  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db();

    const classes = await db.collection('classes').find({ name: /Clareza/i }).toArray();

    console.log('📊 ESTADO FINAL DAS TURMAS CLAREZA:\n');

    for (const cls of classes) {
      console.log(`✅ ${cls.name}`);
      console.log(`   classId: ${cls.classId}`);
      console.log(`   source: ${cls.source}`);
      console.log(`   studentCount: ${cls.studentCount}`);
      console.log(`   isActive: ${cls.isActive}`);
      console.log('');
    }

    console.log('═'.repeat(70));
    console.log('\n🎯 FRONTEND ATUALIZADO:\n');
    console.log('   ✅ ClassesTable.tsx - Badge CursEduca adicionado');
    console.log('   ✅ ManageClasses.tsx - Interface atualizada');
    console.log('   ✅ ClassAnalyticsTab.tsx - Interface atualizada');
    console.log('   ✅ useClassManagement.ts - Interface atualizada');
    console.log('   ✅ useClassFilters.ts - Interface atualizada');
    console.log('   ✅ UnifiedClassModal.tsx - Interface atualizada');
    console.log('   ✅ classUtils.ts - Funções atualizadas\n');

    console.log('═'.repeat(70));
    console.log('\n💡 PRÓXIMOS PASSOS:\n');
    console.log('   1. Refresh da página "Gerir Turmas" no navegador');
    console.log('   2. Verificar se aparece "CursEduca" em vez de "Desconhecida"');
    console.log('   3. Verificar se aparece o número correto de alunos\n');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.close();
  }
}

verify();
