const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');
    console.log('🔧 CORREÇÃO AUTOMÁTICA: Calculando daysInactive para todos UserProducts CursEduca\n');
    console.log('═'.repeat(60));

    const UserProduct = require('./dist/models/UserProduct').default;
    const Product = require('./dist/models/product/Product').default;

    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('_id name code')
      .lean();

    const productIds = curseducaProducts.map(p => p._id);

    // Buscar todos UserProducts CursEduca que têm lastAction mas não têm daysInactive
    const usersToFix = await UserProduct.find({
      productId: { $in: productIds },
      'engagement.lastAction': { $exists: true, $ne: null },
      $or: [
        { 'engagement.daysInactive': { $exists: false } },
        { 'engagement.daysInactive': null }
      ]
    });

    console.log(`\n📊 Encontrados ${usersToFix.length} UserProducts para corrigir\n`);

    if (usersToFix.length === 0) {
      console.log('✅ Nenhum registo precisa de correção!');
      process.exit(0);
    }

    let updated = 0;
    let errors = 0;
    const now = new Date();

    console.log('🚀 Iniciando correção em lote...\n');

    for (const up of usersToFix) {
      try {
        const lastActionDate = new Date(up.engagement.lastAction);
        const daysInactive = Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24));
        const finalDaysInactive = Math.max(0, daysInactive);

        await UserProduct.updateOne(
          { _id: up._id },
          { $set: { 'engagement.daysInactive': finalDaysInactive } }
        );

        updated++;

        if (updated % 50 === 0) {
          console.log(`   ✅ Processados: ${updated}/${usersToFix.length}`);
        }
      } catch (err) {
        errors++;
        console.error(`   ❌ Erro no registo ${up._id}:`, err.message);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 RESULTADO DA CORREÇÃO:\n');
    console.log(`   ✅ Registos atualizados: ${updated}`);
    console.log(`   ❌ Erros: ${errors}`);
    console.log(`   📈 Taxa de sucesso: ${(updated/usersToFix.length*100).toFixed(1)}%`);

    // Verificar resultado final
    console.log('\n🔍 VERIFICAÇÃO PÓS-CORREÇÃO:\n');

    const allUPs = await UserProduct.find({
      productId: { $in: productIds }
    }).lean();

    const withDaysInactive = allUPs.filter(up =>
      up.engagement?.daysInactive !== null && up.engagement?.daysInactive !== undefined
    ).length;

    console.log(`   Total UserProducts CursEduca: ${allUPs.length}`);
    console.log(`   Com daysInactive: ${withDaysInactive} (${(withDaysInactive/allUPs.length*100).toFixed(1)}%)`);
    console.log(`   Sem daysInactive: ${allUPs.length - withDaysInactive} (${((allUPs.length - withDaysInactive)/allUPs.length*100).toFixed(1)}%)`);

    // Verificar João Ferreira especificamente
    const User = require('./dist/models/User').default;
    const joao = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (joao) {
      const joaoProducts = await UserProduct.find({
        userId: joao._id,
        productId: { $in: productIds }
      }).populate('productId', 'name code').lean();

      if (joaoProducts.length > 0) {
        console.log('\n' + '═'.repeat(60));
        console.log('\n✅ VERIFICAÇÃO - JOÃO FERREIRA:\n');
        joaoProducts.forEach(up => {
          console.log(`   📚 ${up.productId?.name}`);
          console.log(`      Progress: ${up.progress?.percentage || 0}%`);
          console.log(`      LastAction: ${up.engagement?.lastAction || 'N/A'}`);
          console.log(`      DaysInactive: ${up.engagement?.daysInactive ?? 'N/A'}`);
          console.log(`      EngagementScore: ${up.engagement?.engagementScore ?? 'N/A'}`);
          console.log('');
        });
      }
    }

    console.log('═'.repeat(60));
    console.log('\n✅ Correção concluída com sucesso!\n');

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro fatal:', err.message);
    process.exit(1);
  });
