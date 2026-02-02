const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');

    const UserProduct = require('./dist/models/UserProduct').default;
    const Product = require('./dist/models/product/Product').default;
    const User = require('./dist/models/User').default;

    // Buscar João Ferreira
    const joao = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (!joao) {
      console.log('❌ João não encontrado');
      process.exit(1);
    }

    console.log('📧 JOÃO FERREIRA');
    console.log(`   Email: ${joao.email}`);
    console.log('');

    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('name code')
      .lean();

    const productIds = curseducaProducts.map(p => p._id);

    // Buscar UserProducts do João
    const joaoProducts = await UserProduct.find({
      userId: joao._id,
      productId: { $in: productIds }
    }).populate('productId', 'name code').lean();

    if (joaoProducts.length === 0) {
      console.log('❌ João não tem produtos CursEduca');
      process.exit(0);
    }

    console.log('📚 PRODUTOS DO JOÃO:\n');

    joaoProducts.forEach(up => {
      console.log(`   ${up.productId?.name} (${up.productId?.code})`);
      console.log(`   Status: ${up.status}`);
      console.log(`   Progress: ${up.progress?.percentage || 0}%`);
      console.log(`   LastAction: ${up.engagement?.lastAction || 'N/A'}`);
      console.log(`   DaysInactive: ${up.engagement?.daysInactive ?? 'N/A'}`);

      if (up.engagement?.lastAction) {
        const lastAction = new Date(up.engagement.lastAction);
        const now = new Date();
        const days = Math.floor((now - lastAction) / (1000 * 60 * 60 * 24));
        console.log(`   DaysInactive CALCULADO: ${days} dias`);
      }
      console.log('');
    });

    // Verificar se foi atualizado
    const hasProgress = joaoProducts.some(up => up.progress?.percentage > 0);

    console.log('═'.repeat(60));
    if (hasProgress) {
      console.log('\n✅ CORREÇÃO FUNCIONOU! João tem progresso > 0%\n');
    } else {
      console.log('\n⚠️  Progresso ainda está a 0% - Sync ainda não correu ou precisa ser executado\n');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
