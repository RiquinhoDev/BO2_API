const mongoose = require('mongoose');

// Importar função de cálculo
const { calculateEngagementMetricsForUserProduct } = require('./dist/services/syncUtilizadoresServices/universalSyncService');

(async () => {
  try {
    console.log('🧪 TESTE DE RECALC COM NOVOS CAMPOS\n');

    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;

    // Buscar 1 utilizador de teste
    const user = await db.collection('users').findOne({ email: 'rui.santos@serriquinho.com' });
    if (!user) {
      console.log('❌ User não encontrado');
      process.exit(1);
    }

    console.log('📧 User:', user.email);
    console.log('User ID:', user._id.toString());
    console.log('');

    // Buscar produtos
    const userProducts = await db.collection('userproducts').find({ userId: user._id }).toArray();
    console.log('Produtos:', userProducts.length);
    console.log('');

    for (const up of userProducts) {
      const product = await db.collection('products').findOne({ _id: up.productId });
      console.log(`📦 Produto: ${product.name} (${product.platform})`);
      console.log('');

      // Calcular métricas
      const metrics = calculateEngagementMetricsForUserProduct(user, product);

      console.log('✅ ENGAGEMENT METRICS CALCULADAS:');
      console.log(JSON.stringify(metrics.engagement, null, 2));
      console.log('');
      console.log('CAMPOS NOVOS:');
      console.log('  daysInactive:', metrics.engagement.daysInactive);
      console.log('  loginsLast30Days:', metrics.engagement.loginsLast30Days);
      console.log('  weeksActiveLast30Days:', metrics.engagement.weeksActiveLast30Days);
      console.log('');
      console.log('─'.repeat(70));
      console.log('');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
