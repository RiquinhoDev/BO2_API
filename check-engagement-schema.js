const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;

    // Buscar 1 UserProduct com engagement
    const up = await db.collection('userproducts').findOne({
      'engagement': { $exists: true }
    });

    console.log('📊 ENGAGEMENT SCHEMA NA BD:\n');
    console.log(JSON.stringify(up.engagement, null, 2));
    console.log('\n✅ Campos disponíveis:', Object.keys(up.engagement || {}).join(', '));

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
