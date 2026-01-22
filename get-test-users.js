const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');
    const users = db.collection('users');

    const samples = await userProducts.find({
      'progress.modulesList': { $exists: true, $ne: [] }
    }).limit(3).toArray();

    console.log('📋 3 ALUNOS COM MODULESLIST PARA TESTAR:\n');

    for (let idx = 0; idx < samples.length; idx++) {
      const up = samples[idx];
      const user = await users.findOne({ _id: up.userId });
      
      if (user) {
        console.log((idx + 1) + '. ' + user.email);
        console.log('   User ID: ' + up.userId.toString());
        console.log('   Product ID: ' + up.productId.toString());
        console.log('   Módulos: ' + (up.progress?.totalModules || 0));
        console.log('   Progresso: ' + (up.progress?.percentage || 0) + '%');
        console.log('');
      }
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
