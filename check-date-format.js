const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');

    const sample = await userProducts.findOne({
      'progress.modulesList': { $exists: true, $ne: [] }
    });

    console.log('📋 Exemplo de UserProduct com modules:');
    console.log('');
    console.log('lastAccessDate:', sample.progress?.lastAccessDate);
    console.log('Tipo:', typeof sample.progress?.lastAccessDate);
    console.log('');
    
    if (sample.progress?.lastAccessDate) {
      const date = new Date(sample.progress.lastAccessDate);
      console.log('Convertido para Date:', date.toISOString());
    }
    
    console.log('');
    console.log('Campos disponíveis em progress:');
    console.log(Object.keys(sample.progress || {}));

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('Erro:', err.message);
    process.exit(1);
  }
})();
