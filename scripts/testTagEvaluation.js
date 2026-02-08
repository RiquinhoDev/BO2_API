// ════════════════════════════════════════════════════════════
// Script para testar Tag System V2 com alunos reais
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

// Importar models
const UserProduct = require('../dist/models/UserProduct').default;
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product/Product').default;

// Importar funções de avaliação
const { evaluateStudentTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/evaluateStudentTags');
const { formatBOTag } = require('../dist/jobs/dailyPipeline/tagEvaluation/tagFormatter');

// Lista de emails para testar
const TEST_EMAILS = [
  'joaobarroshtc@gmail.com',
  'adalmoniz2009@gmail.com',
  'jrge.s@hotmail.com',
  'fisiocatarinafaria@gmail.com'
];

async function testTagEvaluation() {
  try {
    console.log('🔌 Conectando à BD...\n');
    await mongoose.connect(process.env.MONGO_URI);

    for (const email of TEST_EMAILS) {
      console.log('═'.repeat(70));
      console.log(`📧 TESTANDO: ${email}`);
      console.log('═'.repeat(70));

      // Buscar utilizador
      const user = await User.findOne({ email }).lean();
      if (!user) {
        console.log(`❌ User não encontrado: ${email}\n`);
        continue;
      }

      console.log(`👤 Nome: ${user.name || 'N/A'}`);

      // Buscar UserProducts deste utilizador
      const userProducts = await UserProduct.find({
        userId: user._id,
        status: 'ACTIVE'
      })
        .populate('productId')
        .lean();

      if (userProducts.length === 0) {
        console.log(`⚠️  Nenhum UserProduct ACTIVE encontrado\n`);
        continue;
      }

      console.log(`📦 Produtos: ${userProducts.length}`);

      // Avaliar cada produto
      for (const up of userProducts) {
        const productName = up.productId?.name || 'UNKNOWN';
        console.log(`\n${'─'.repeat(70)}`);
        console.log(`🎯 PRODUTO: ${productName}`);
        console.log(`${'─'.repeat(70)}`);

        // DADOS ATUAIS
        console.log('\n📊 DADOS DO ALUNO:');
        console.log(`   Status: ${up.status}`);
        console.log(`   Progresso: ${up.progress?.percentage || 0}%`);

        const daysInactive = up.engagement?.daysSinceLastLogin ?? up.engagement?.daysSinceLastAction ?? 'N/A';
        console.log(`   Dias inativo: ${daysInactive}`);

        const engagementScore = up.engagement?.score ?? 'N/A';
        console.log(`   Engagement Score: ${engagementScore}`);

        if (up.progress?.modulesList && up.progress.modulesList.length > 0) {
          const totalModules = up.progress.modulesList.length;
          const completedModules = up.progress.modulesList.filter(m => m.isCompleted || m.completed).length;
          console.log(`   Módulos: ${completedModules}/${totalModules} completos`);

          // Verificar M1 e M2
          const m1 = up.progress.modulesList.find(m => m.sequence === 1);
          const m2 = up.progress.modulesList.find(m => m.sequence === 2);

          if (m1) {
            console.log(`   M1: ${m1.isCompleted ? '✅ Completo' : '⏳ Incompleto'} (${m1.completedPages || 0}/${m1.totalPages || 0} páginas)`);
          }
          if (m2) {
            console.log(`   M2: ${m2.isCompleted ? '✅ Completo' : '⏳ Incompleto'} (${m2.completedPages || 0}/${m2.totalPages || 0} páginas)`);
          }
        }

        // TAGS ATUAIS
        const currentTags = up.activeCampaignData?.tags || [];
        console.log(`\n🏷️  TAGS ATUAIS (${currentTags.length}):`);
        if (currentTags.length > 0) {
          currentTags.forEach(tag => console.log(`   - ${tag}`));
        } else {
          console.log('   (nenhuma)');
        }

        // AVALIAR NOVAS TAGS
        console.log(`\n🔄 AVALIANDO TAGS (Tag System V2)...`);

        try {
          const result = evaluateStudentTags(
            {
              ...user,
              _id: user._id,
              email: user.email,
              name: user.name
            },
            up,
            productName
          );

          const newTags = result.tags || [];
          const appliedDetails = result.appliedTagsDetails || [];

          console.log(`\n✨ NOVAS TAGS (${newTags.length}):`);
          if (newTags.length > 0) {
            newTags.forEach(tag => console.log(`   - ${tag}`));
          } else {
            console.log('   (nenhuma)');
          }

          // DETALHES POR CATEGORIA
          if (appliedDetails.length > 0) {
            console.log(`\n📋 TAGS POR CATEGORIA:`);
            appliedDetails.forEach(detail => {
              console.log(`   ${detail.category}: ${detail.tags.join(', ')}`);
              console.log(`      Motivo: ${detail.reason}`);
            });
          }

          // DIFF
          const tagsToAdd = newTags.filter(tag => !currentTags.includes(tag));
          const tagsToRemove = currentTags.filter(tag => !newTags.includes(tag));

          console.log(`\n🔄 MUDANÇAS:`);
          if (tagsToAdd.length > 0) {
            console.log(`   ➕ A ADICIONAR (${tagsToAdd.length}):`);
            tagsToAdd.forEach(tag => console.log(`      + ${tag}`));
          } else {
            console.log(`   ➕ Nenhuma tag para adicionar`);
          }

          if (tagsToRemove.length > 0) {
            console.log(`   ➖ A REMOVER (${tagsToRemove.length}):`);
            tagsToRemove.forEach(tag => console.log(`      - ${tag}`));
          } else {
            console.log(`   ➖ Nenhuma tag para remover`);
          }

          if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
            console.log(`   ✅ Tags já estão corretas!`);
          }

        } catch (evalError) {
          console.error(`\n❌ ERRO na avaliação:`, evalError.message);
          console.error(evalError.stack);
        }
      }

      console.log('\n');
    }

    console.log('═'.repeat(70));
    console.log('✅ TESTES CONCLUÍDOS!');
    console.log('═'.repeat(70));

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Erro fatal:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testTagEvaluation();
