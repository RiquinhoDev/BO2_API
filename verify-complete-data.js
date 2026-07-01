const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');

    const UserProduct = require('./dist/models/UserProduct').default;
    const Product = require('./dist/models/product/Product').default;

    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('name code')
      .lean();

    const productIds = curseducaProducts.map(p => p._id);

    // Buscar todos UserProducts CursEduca
    const allUPs = await UserProduct.find({
      productId: { $in: productIds }
    }).populate('productId', 'name code').lean();

    console.log('📊 ANÁLISE DE DADOS CURSEDUCA\n');
    console.log('═'.repeat(60));
    console.log(`\nTotal de UserProducts CursEduca: ${allUPs.length}`);

    // Estatísticas de campos incompletos
    const stats = {
      totalUsers: allUPs.length,
      withProgress: 0,
      withoutProgress: 0,
      withDaysInactive: 0,
      withoutDaysInactive: 0,
      withLastAction: 0,
      withoutLastAction: 0,
      withEngagementScore: 0,
      withoutEngagementScore: 0,
      completeData: 0,
      incompleteData: 0
    };

    allUPs.forEach(up => {
      // Progress
      if (up.progress?.percentage > 0) {
        stats.withProgress++;
      } else {
        stats.withoutProgress++;
      }

      // Days Inactive
      if (up.engagement?.daysInactive !== null && up.engagement?.daysInactive !== undefined) {
        stats.withDaysInactive++;
      } else {
        stats.withoutDaysInactive++;
      }

      // Last Action
      if (up.engagement?.lastAction) {
        stats.withLastAction++;
      } else {
        stats.withoutLastAction++;
      }

      // Engagement Score
      if (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined) {
        stats.withEngagementScore++;
      } else {
        stats.withoutEngagementScore++;
      }

      // Complete vs Incomplete
      const isComplete = (
        (up.progress?.percentage > 0) &&
        (up.engagement?.daysInactive !== null && up.engagement?.daysInactive !== undefined) &&
        (up.engagement?.lastAction) &&
        (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined)
      );

      if (isComplete) {
        stats.completeData++;
      } else {
        stats.incompleteData++;
      }
    });

    console.log('\n📈 PROGRESS DATA:');
    console.log(`   ✅ Com progresso > 0%: ${stats.withProgress} (${(stats.withProgress/stats.totalUsers*100).toFixed(1)}%)`);
    console.log(`   ❌ Sem progresso (0%): ${stats.withoutProgress} (${(stats.withoutProgress/stats.totalUsers*100).toFixed(1)}%)`);

    console.log('\n⏰ DAYS INACTIVE:');
    console.log(`   ✅ Com daysInactive: ${stats.withDaysInactive} (${(stats.withDaysInactive/stats.totalUsers*100).toFixed(1)}%)`);
    console.log(`   ❌ Sem daysInactive: ${stats.withoutDaysInactive} (${(stats.withoutDaysInactive/stats.totalUsers*100).toFixed(1)}%)`);

    console.log('\n🕒 LAST ACTION:');
    console.log(`   ✅ Com lastAction: ${stats.withLastAction} (${(stats.withLastAction/stats.totalUsers*100).toFixed(1)}%)`);
    console.log(`   ❌ Sem lastAction: ${stats.withoutLastAction} (${(stats.withoutLastAction/stats.totalUsers*100).toFixed(1)}%)`);

    console.log('\n📊 ENGAGEMENT SCORE:');
    console.log(`   ✅ Com engagementScore: ${stats.withEngagementScore} (${(stats.withEngagementScore/stats.totalUsers*100).toFixed(1)}%)`);
    console.log(`   ❌ Sem engagementScore: ${stats.withoutEngagementScore} (${(stats.withoutEngagementScore/stats.totalUsers*100).toFixed(1)}%)`);

    console.log('\n' + '═'.repeat(60));
    console.log('\n🎯 RESUMO FINAL:');
    console.log(`   ✅ Dados COMPLETOS: ${stats.completeData} (${(stats.completeData/stats.totalUsers*100).toFixed(1)}%)`);
    console.log(`   ⚠️  Dados INCOMPLETOS: ${stats.incompleteData} (${(stats.incompleteData/stats.totalUsers*100).toFixed(1)}%)`);

    // Mostrar exemplos de dados incompletos
    console.log('\n📋 EXEMPLOS DE DADOS INCOMPLETOS (primeiros 5):');
    const incompleteExamples = allUPs.filter(up => {
      return !(
        (up.progress?.percentage > 0) &&
        (up.engagement?.daysInactive !== null && up.engagement?.daysInactive !== undefined) &&
        (up.engagement?.lastAction) &&
        (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined)
      );
    }).slice(0, 5);

    incompleteExamples.forEach((up, idx) => {
      console.log(`\n   ${idx + 1}. Produto: ${up.productId?.name || 'Unknown'}`);
      console.log(`      Progress: ${up.progress?.percentage || 0}%`);
      console.log(`      LastAction: ${up.engagement?.lastAction || 'N/A'}`);
      console.log(`      DaysInactive: ${up.engagement?.daysInactive ?? 'N/A'}`);
      console.log(`      EngagementScore: ${up.engagement?.engagementScore ?? 'N/A'}`);
    });

    // Verificar especificamente João Ferreira
    console.log('\n' + '═'.repeat(60));
    console.log('\n🔍 VERIFICAÇÃO ESPECÍFICA - JOÃO FERREIRA:');

    const User = require('./dist/models/User').default;
    const joao = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (joao) {
      const joaoProducts = await UserProduct.find({
        userId: joao._id,
        productId: { $in: productIds }
      }).populate('productId', 'name code').lean();

      if (joaoProducts.length > 0) {
        joaoProducts.forEach(up => {
          console.log(`\n   📚 ${up.productId?.name}`);
          console.log(`      Progress: ${up.progress?.percentage || 0}%`);
          console.log(`      LastAction: ${up.engagement?.lastAction || 'N/A'}`);
          console.log(`      DaysInactive: ${up.engagement?.daysInactive ?? 'N/A'}`);
          console.log(`      EngagementScore: ${up.engagement?.engagementScore ?? 'N/A'}`);

          if (up.engagement?.lastAction && (up.engagement?.daysInactive === null || up.engagement?.daysInactive === undefined)) {
            const lastAction = new Date(up.engagement.lastAction);
            const now = new Date();
            const calculatedDays = Math.floor((now - lastAction) / (1000 * 60 * 60 * 24));
            console.log(`      ⚠️  FALTA daysInactive! (deveria ser ~${calculatedDays} dias)`);
          }
        });
      } else {
        console.log('   ❌ João não tem produtos CursEduca');
      }
    } else {
      console.log('   ❌ João não encontrado');
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ Análise concluída!\n');

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
