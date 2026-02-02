const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/bo_db')
  .then(async () => {
    const UserProduct = require('./src/models/UserProduct').default;
    const Product = require('./src/models/product/Product').default;
    const User = require('./src/models/user').default;

    console.log('\n🔍 VERIFICANDO DADOS CURSEDUCA...\n');

    // 1. Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' }).select('name code').lean();
    console.log('📦 PRODUTOS CURSEDUCA:', curseducaProducts.length);
    curseducaProducts.forEach(p => {
      console.log(`   - ${p.name} (${p.code})`);
    });

    const productIds = curseducaProducts.map(p => p._id);

    // 2. Buscar UserProducts
    const userProducts = await UserProduct.find({
      productId: { $in: productIds }
    })
      .populate('userId', 'name email')
      .populate('productId', 'name code')
      .limit(10)
      .lean();

    console.log('\n👥 USER PRODUCTS CURSEDUCA:', userProducts.length);

    if (userProducts.length === 0) {
      console.log('❌ Nenhum UserProduct encontrado!');
      process.exit(0);
    }

    // 3. Analisar dados
    console.log('\n📊 EXEMPLOS DE DADOS:\n');

    userProducts.forEach((up, i) => {
      console.log(`${i + 1}. ${up.userId?.name || 'SEM NOME'} (${up.userId?.email})`);
      console.log(`   Produto: ${up.productId?.name} (${up.productId?.code})`);
      console.log(`   Status: ${up.status}`);

      // Progress
      if (up.progress) {
        console.log(`   Progress:`);
        console.log(`      - Percentage: ${up.progress.percentage || 0}%`);
        console.log(`      - Modules: ${up.progress.modulesList?.length || 0}`);
      } else {
        console.log(`   Progress: ❌ SEM DADOS`);
      }

      // Engagement
      if (up.engagement) {
        console.log(`   Engagement:`);
        console.log(`      - Days Inactive: ${up.engagement.daysInactive}`);
        console.log(`      - Logins Last 30d: ${up.engagement.loginsLast30Days}`);
        console.log(`      - Last Login: ${up.engagement.lastLogin}`);
      } else {
        console.log(`   Engagement: ❌ SEM DADOS`);
      }

      console.log('');
    });

    // 4. Stats gerais
    const totalUserProducts = await UserProduct.countDocuments({
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

    console.log('\n📈 ESTATÍSTICAS GERAIS:');
    console.log(`   Total UserProducts: ${totalUserProducts}`);
    console.log(`   Com progresso (>0%): ${withProgress} (${Math.round(withProgress/totalUserProducts*100)}%)`);
    console.log(`   Com dados engagement: ${withEngagement} (${Math.round(withEngagement/totalUserProducts*100)}%)`);

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
