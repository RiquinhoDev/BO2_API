const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');

    const totalUserProducts = await userProducts.countDocuments();
    const withModules = await userProducts.countDocuments({
      'progress.modulesList': { $exists: true, $ne: [] }
    });
    const withoutModules = totalUserProducts - withModules;
    const percentage = ((withModules / totalUserProducts) * 100).toFixed(2);

    console.log('📊 ESTATÍSTICAS DE MODULES:');
    console.log('');
    console.log('Total UserProducts:', totalUserProducts);
    console.log('Com modulesList:', withModules);
    console.log('Sem modulesList:', withoutModules);
    console.log('Percentagem com módulos:', percentage + '%');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
