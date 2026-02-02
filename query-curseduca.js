const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');

    const UserProduct = require('./dist/models/UserProduct').default;
    const Product = require('./dist/models/product/Product').default;

    // 1. Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('name code')
      .lean();

    console.log('📦 PRODUTOS CURSEDUCA:');
    curseducaProducts.forEach(p => {
      console.log(`   - ${p.name} (${p.code})`);
    });
    console.log('');

    const productIds = curseducaProducts.map(p => p._id);

    // 2. Stats gerais
    const total = await UserProduct.countDocuments({
      productId: { $in: productIds }
    });

    const withProgress = await UserProduct.countDocuments({
      productId: { $in: productIds },
      'progress.percentage': { $exists: true, $gt: 0 }
    });

    const withEngagement = await UserProduct.countDocuments({
      productId: { $in: productIds },
      'engagement.daysInactive': { $exists: true }
    });

    const withLastAction = await UserProduct.countDocuments({
      productId: { $in: productIds },
      'engagement.lastAction': { $exists: true }
    });

    console.log('📊 ESTATÍSTICAS:');
    console.log(`   Total UserProducts: ${total}`);
    console.log(`   Com progress > 0: ${withProgress} (${Math.round(withProgress/total*100)}%)`);
    console.log(`   Com daysInactive: ${withEngagement} (${Math.round(withEngagement/total*100)}%)`);
    console.log(`   Com lastAction: ${withLastAction} (${Math.round(withLastAction/total*100)}%)`);
    console.log('');

    // 3. Exemplos
    console.log('📝 EXEMPLOS (5 primeiros):');
    const examples = await UserProduct.find({
      productId: { $in: productIds }
    })
      .limit(5)
      .lean();

    examples.forEach((up, i) => {
      console.log(`\n${i+1}. UserProduct ID: ${up._id}`);
      console.log(`   Status: ${up.status}`);
      console.log(`   Progress: ${up.progress?.percentage || 0}%`);
      console.log(`   LastAction: ${up.engagement?.lastAction || 'N/A'}`);
      console.log(`   DaysInactive: ${up.engagement?.daysInactive ?? 'N/A'}`);

      // Calcular daysInactive se tivermos lastAction
      if (up.engagement?.lastAction) {
        const lastAction = new Date(up.engagement.lastAction);
        const now = new Date();
        const days = Math.floor((now - lastAction) / (1000 * 60 * 60 * 24));
        console.log(`   ⚙️ DaysInactive CALCULADO: ${days} dias`);
      }
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
