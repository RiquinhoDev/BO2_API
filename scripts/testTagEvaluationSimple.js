// ════════════════════════════════════════════════════════════
// Script SIMPLES para testar Tag System V2 - chama funções individuais
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

// Importar models
const UserProduct = require('../dist/models/UserProduct').default;
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product/Product').default;

// Importar funções de avaliação individuais
const { evaluateAccountStatusTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/accountStatusTags');
const { evaluateInactivityTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/inactivityTags');
const { evaluateEngagementTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/engagementTags');
const { evaluateProgressTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/progressTags');
const { evaluateCompletionTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/completionTags');
const { evaluatePositiveTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/positiveTags');
const { evaluateModuleStuckTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/moduleStuckTags');
const { calculateEngagementScore } = require('../dist/jobs/dailyPipeline/tagEvaluation/engagementScore');

// Lista de emails para testar
const TEST_EMAILS = [
  'joaobarroshtc@gmail.com',
  'adalmoniz2009@gmail.com',
  'jrge.s@hotmail.com',
  'fisiocatarinafaria@gmail.com',
  'cabarreira.cb@gmail.com',  // Teste "Parou após M1"
  'monicarego98@gmail.com'     // Teste "Inativado Manualmente"
];

function normalizeProductName(productName) {
  // OGI
  if (/OGI/i.test(productName)) {
    return 'OGI_V1';
  }

  // CLAREZA Anual
  if (/CLAREZA.*ANUAL/i.test(productName)) {
    return 'CLAREZA_ANUAL';
  }

  // CLAREZA Mensal
  if (/CLAREZA.*MENSAL/i.test(productName)) {
    return 'CLAREZA_MENSAL';
  }

  // CLAREZA genérico
  if (/CLAREZA/i.test(productName)) {
    return 'CLAREZA_ANUAL';
  }

  return productName;
}

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
        const normalizedName = normalizeProductName(productName);

        console.log(`\n${'─'.repeat(70)}`);
        console.log(`🎯 PRODUTO: ${productName}`);
        console.log(`   (Normalizado: ${normalizedName})`);
        console.log(`${'─'.repeat(70)}`);

        // DADOS ATUAIS
        console.log('\n📊 DADOS DO ALUNO:');
        console.log(`   Status: ${up.status}`);
        console.log(`   Progresso: ${up.progress?.percentage || 0}%`);

        const daysInactive = up.engagement?.daysSinceLastLogin ?? up.engagement?.daysSinceLastAction ?? 'N/A';
        console.log(`   Dias inativo: ${daysInactive}`);

        const engagementScore = calculateEngagementScore(up, normalizedName);
        console.log(`   Engagement Score: ${engagementScore}`);

        if (up.progress?.modulesList && up.progress.modulesList.length > 0) {
          const totalModules = up.progress.modulesList.length;
          const completedModules = up.progress.modulesList.filter(m => m.isCompleted || m.completed).length;
          console.log(`   Módulos: ${completedModules}/${totalModules} completos`);

          // Verificar M1 e M2
          const m1 = up.progress.modulesList.find(m => m.sequence === 1);
          const m2 = up.progress.modulesList.find(m => m.sequence === 2);

          if (m1) {
            const m1Status = m1.isCompleted ? '✅ Completo' : '⏳ Incompleto';
            console.log(`   M1: ${m1Status} (${m1.completedPages || 0}/${m1.totalPages || 0} páginas)`);
          }
          if (m2) {
            const m2Status = m2.isCompleted ? '✅ Completo' : '⏳ Incompleto';
            console.log(`   M2: ${m2Status} (${m2.completedPages || 0}/${m2.totalPages || 0} páginas)`);
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

        // AVALIAR NOVAS TAGS POR CATEGORIA
        console.log(`\n🔄 AVALIANDO TAGS (Tag System V2)...`);

        try {
          const newTags = [];
          const appliedDetails = [];

          // 1️⃣ ACCOUNT_STATUS
          const accountStatusTags = evaluateAccountStatusTags(up, normalizedName);
          if (accountStatusTags.length > 0) {
            newTags.push(...accountStatusTags);
            appliedDetails.push({
              category: 'ACCOUNT_STATUS',
              tags: accountStatusTags,
              reason: `Status da conta: ${up.status}`
            });
          }

          // 2️⃣ COMPLETION
          const completionTags = evaluateCompletionTags(up, normalizedName);
          if (completionTags.length > 0) {
            newTags.push(...completionTags);
            appliedDetails.push({
              category: 'COMPLETION',
              tags: completionTags,
              reason: `Progresso: ${up.progress?.percentage || 0}%`
            });
          }

          // 3️⃣ INACTIVITY
          const inactivityTags = evaluateInactivityTags(up, normalizedName);
          if (inactivityTags.length > 0) {
            newTags.push(...inactivityTags);
            appliedDetails.push({
              category: 'INACTIVITY',
              tags: inactivityTags,
              reason: `${daysInactive} dias inativo`
            });
          }

          // 4️⃣ PROGRESS
          const progressTags = evaluateProgressTags(up, normalizedName);
          if (progressTags.length > 0) {
            newTags.push(...progressTags);
            appliedDetails.push({
              category: 'PROGRESS',
              tags: progressTags,
              reason: `Progresso: ${up.progress?.percentage || 0}%`
            });
          }

          // 5️⃣ ENGAGEMENT
          const engagementTags = evaluateEngagementTags(up, normalizedName);
          if (engagementTags.length > 0) {
            newTags.push(...engagementTags);
            appliedDetails.push({
              category: 'ENGAGEMENT',
              tags: engagementTags,
              reason: `Score: ${engagementScore}`
            });
          }

          // 6️⃣ POSITIVE
          const positiveTags = evaluatePositiveTags(up, normalizedName);
          if (positiveTags.length > 0) {
            newTags.push(...positiveTags);
            appliedDetails.push({
              category: 'POSITIVE',
              tags: positiveTags,
              reason: `Aluno ativo/engajado`
            });
          }

          // 7️⃣ MODULE_STUCK (só OGI)
          const moduleStuckTags = evaluateModuleStuckTags(up, normalizedName);
          if (moduleStuckTags.length > 0) {
            newTags.push(...moduleStuckTags);
            appliedDetails.push({
              category: 'MODULE_STUCK',
              tags: moduleStuckTags,
              reason: `Parou após módulo`
            });
          }

          console.log(`\n✨ NOVAS TAGS (${newTags.length}):`);
          if (newTags.length > 0) {
            newTags.forEach(tag => console.log(`   - ${tag}`));
          } else {
            console.log(`   (nenhuma)`);
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
          const tagsToRemove = currentTags.filter(tag => {
            // Não remover tags de testemunhos
            if (/testemunho/i.test(tag) || /depoimento/i.test(tag)) {
              return false;
            }
            // Remover se for tag BO_ e não está nas novas tags
            if (tag.startsWith('BO_') && !newTags.includes(tag)) {
              return true;
            }
            return false;
          });

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
