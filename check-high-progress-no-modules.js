const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');
    const users = db.collection('users');

    console.log('🔍 PROCURANDO: Alunos com progresso >= 30% SEM modulesList\n');

    const highProgressNoModules = await userProducts.find({
      'progress.percentage': { $gte: 30 },
      $or: [
        { 'progress.modulesList': { $exists: false } },
        { 'progress.modulesList': { $size: 0 } }
      ]
    }).limit(10).toArray();

    console.log('📊 Total encontrados:', highProgressNoModules.length);
    console.log('');

    if (highProgressNoModules.length > 0) {
      console.log('📋 Exemplos (primeiros 5):');
      console.log('');

      for (let idx = 0; idx < Math.min(5, highProgressNoModules.length); idx++) {
        const up = highProgressNoModules[idx];
        const user = await users.findOne({ _id: up.userId });
        
        console.log((idx + 1) + '. Email: ' + (user?.email || 'N/A'));
        console.log('   Progresso: ' + (up.progress?.percentage || 0) + '%');
        console.log('   Aulas completas: ' + (up.progress?.completed || 0) + '/' + (up.progress?.total || 0));
        console.log('   Produto ID: ' + up.productId?.toString().substring(0, 12) + '...');
        console.log('   modulesList: ' + (up.progress?.modulesList ? 'existe mas vazio' : 'não existe'));
        console.log('');
      }

      console.log('📈 Distribuição por progresso (SEM modules):');
      
      const count30_50 = await userProducts.countDocuments({
        'progress.percentage': { $gte: 30, $lt: 50 },
        $or: [
          { 'progress.modulesList': { $exists: false } },
          { 'progress.modulesList': { $size: 0 } }
        ]
      });
      
      const count50_75 = await userProducts.countDocuments({
        'progress.percentage': { $gte: 50, $lt: 75 },
        $or: [
          { 'progress.modulesList': { $exists: false } },
          { 'progress.modulesList': { $size: 0 } }
        ]
      });
      
      const count75_100 = await userProducts.countDocuments({
        'progress.percentage': { $gte: 75, $lte: 100 },
        $or: [
          { 'progress.modulesList': { $exists: false } },
          { 'progress.modulesList': { $size: 0 } }
        ]
      });

      console.log('  30-50%: ' + count30_50 + ' alunos');
      console.log('  50-75%: ' + count50_75 + ' alunos');
      console.log('  75-100%: ' + count75_100 + ' alunos');

    } else {
      console.log('✅ Não encontrados alunos com progresso >= 30% sem modules!');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
