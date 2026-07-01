const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');
    console.log('📊 VERIFICAÇÃO FINAL: daysSinceLastAction em UserProducts CursEduca\n');
    console.log('═'.repeat(60));

    const UserProduct = require('./dist/models/UserProduct').default;
    const Product = require('./dist/models/product/Product').default;

    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('_id name')
      .lean();

    const productIds = curseducaProducts.map(p => p._id);

    // Buscar todos UserProducts CursEduca
    const allUPs = await UserProduct.find({
      productId: { $in: productIds }
    }).lean();

    console.log(`\nTotal de UserProducts CursEduca: ${allUPs.length}\n`);

    // Estatísticas
    const stats = {
      total: allUPs.length,
      withProgress: 0,
      withLastAction: 0,
      withDaysSinceLastAction: 0,
      withDaysSinceLastLogin: 0,
      withEngagementScore: 0,
      fullyComplete: 0
    };

    allUPs.forEach(up => {
      if (up.progress?.percentage > 0) stats.withProgress++;
      if (up.engagement?.lastAction) stats.withLastAction++;
      if (up.engagement?.daysSinceLastAction !== null && up.engagement?.daysSinceLastAction !== undefined) {
        stats.withDaysSinceLastAction++;
      }
      if (up.engagement?.daysSinceLastLogin !== null && up.engagement?.daysSinceLastLogin !== undefined) {
        stats.withDaysSinceLastLogin++;
      }
      if (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined) {
        stats.withEngagementScore++;
      }

      // Completude: tem progresso + lastAction + daysSinceLastAction + engagementScore
      const isComplete = (
        (up.progress?.percentage >= 0) &&
        (up.engagement?.lastAction) &&
        (up.engagement?.daysSinceLastAction !== null && up.engagement?.daysSinceLastAction !== undefined) &&
        (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined)
      );

      if (isComplete) stats.fullyComplete++;
    });

    console.log('📈 ESTATÍSTICAS DE COMPLETUDE:\n');
    console.log(`   Progress (>= 0%): ${stats.withProgress} (${(stats.withProgress/stats.total*100).toFixed(1)}%)`);
    console.log(`   LastAction: ${stats.withLastAction} (${(stats.withLastAction/stats.total*100).toFixed(1)}%)`);
    console.log(`   DaysSinceLastAction: ${stats.withDaysSinceLastAction} (${(stats.withDaysSinceLastAction/stats.total*100).toFixed(1)}%)`);
    console.log(`   DaysSinceLastLogin: ${stats.withDaysSinceLastLogin} (${(stats.withDaysSinceLastLogin/stats.total*100).toFixed(1)}%)`);
    console.log(`   EngagementScore: ${stats.withEngagementScore} (${(stats.withEngagementScore/stats.total*100).toFixed(1)}%)`);

    console.log('\n' + '═'.repeat(60));
    console.log(`\n🎯 DADOS COMPLETOS: ${stats.fullyComplete} / ${stats.total} (${(stats.fullyComplete/stats.total*100).toFixed(1)}%)\n`);

    if (stats.fullyComplete === stats.total) {
      console.log('✅ TODOS OS UTILIZADORES CURSEDUCA TÊM DADOS COMPLETOS!\n');
    } else {
      console.log(`⚠️  ${stats.total - stats.fullyComplete} utilizadores ainda têm dados incompletos\n`);

      // Mostrar exemplos de incompletos
      const incomplete = allUPs.filter(up => {
        return !(
          (up.progress?.percentage >= 0) &&
          (up.engagement?.lastAction) &&
          (up.engagement?.daysSinceLastAction !== null && up.engagement?.daysSinceLastAction !== undefined) &&
          (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined)
        );
      }).slice(0, 3);

      console.log('📋 EXEMPLOS DE INCOMPLETOS (primeiros 3):');
      incomplete.forEach((up, idx) => {
        console.log(`\n   ${idx + 1}.`);
        console.log(`      Progress: ${up.progress?.percentage ?? 'N/A'}%`);
        console.log(`      LastAction: ${up.engagement?.lastAction || 'N/A'}`);
        console.log(`      DaysSinceLastAction: ${up.engagement?.daysSinceLastAction ?? 'N/A'}`);
        console.log(`      EngagementScore: ${up.engagement?.engagementScore ?? 'N/A'}`);
      });
    }

    // Verificar João
    const User = require('./dist/models/User').default;
    const joao = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (joao) {
      const joaoProducts = await UserProduct.find({
        userId: joao._id,
        productId: { $in: productIds }
      }).populate('productId', 'name code').lean();

      console.log('\n' + '═'.repeat(60));
      console.log('\n🔍 VERIFICAÇÃO - JOÃO FERREIRA:\n');

      joaoProducts.forEach(up => {
        console.log(`   📚 ${up.productId?.name}`);
        console.log(`      Progress: ${up.progress?.percentage || 0}%`);
        console.log(`      LastAction: ${new Date(up.engagement?.lastAction).toLocaleDateString('pt-PT')}`);
        console.log(`      DaysSinceLastAction: ${up.engagement?.daysSinceLastAction ?? 'N/A'} dias`);
        console.log(`      EngagementScore: ${up.engagement?.engagementScore ?? 'N/A'}`);

        const isComplete = (
          (up.progress?.percentage >= 0) &&
          (up.engagement?.lastAction) &&
          (up.engagement?.daysSinceLastAction !== null && up.engagement?.daysSinceLastAction !== undefined) &&
          (up.engagement?.engagementScore !== null && up.engagement?.engagementScore !== undefined)
        );

        console.log(`      Status: ${isComplete ? '✅ COMPLETO' : '⚠️ INCOMPLETO'}`);
        console.log('');
      });
    }

    console.log('═'.repeat(60));
    console.log('\n✅ Verificação concluída!\n');

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
