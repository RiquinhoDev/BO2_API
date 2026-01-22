const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');

    // Data de corte: 1 de dezembro de 2024
    const cutoffDate = new Date('2024-12-01').getTime();

    console.log('📊 ANÁLISE: Módulos vs Atividade Recente');
    console.log('Condição: lastAccessDate >= 1 Dezembro 2024\n');

    // Total de userproducts
    const total = await userProducts.countDocuments();

    // Ativos (lastAccessDate >= dez 2024)
    const totalActive = await userProducts.countDocuments({
      'progress.lastAccessDate': { $gte: cutoffDate }
    });

    // Ativos COM modules
    const activeWithModules = await userProducts.countDocuments({
      'progress.lastAccessDate': { $gte: cutoffDate },
      'progress.modulesList': { $exists: true, $ne: [] }
    });

    // Ativos SEM modules
    const activeWithoutModules = totalActive - activeWithModules;

    // Inativos COM modules (edge case - não deveria acontecer muito)
    const inactiveWithModules = await userProducts.countDocuments({
      $or: [
        { 'progress.lastAccessDate': { $lt: cutoffDate } },
        { 'progress.lastAccessDate': { $exists: false } }
      ],
      'progress.modulesList': { $exists: true, $ne: [] }
    });

    // Total com modules
    const totalWithModules = await userProducts.countDocuments({
      'progress.modulesList': { $exists: true, $ne: [] }
    });

    console.log('📈 RESUMO GERAL:');
    console.log('  Total UserProducts:', total);
    console.log('  Total Ativos (>= dez 2024):', totalActive);
    console.log('  Total com Modules:', totalWithModules);
    console.log('');

    console.log('✅ ATIVOS (>= dez 2024):');
    console.log('  Com modules:', activeWithModules);
    console.log('  Sem modules:', activeWithoutModules);
    console.log('  % ativos com modules:', ((activeWithModules / totalActive) * 100).toFixed(2) + '%');
    console.log('');

    console.log('⚠️  VERIFICAÇÃO:');
    console.log('  Inativos com modules:', inactiveWithModules);
    console.log('');

    console.log('🎯 CONCLUSÃO:');
    if (activeWithModules === totalWithModules) {
      console.log('  ✅ TODOS os módulos são de utilizadores ativos!');
    } else {
      console.log('  ⚠️  Há', inactiveWithModules, 'inativos com modules');
    }

    if (activeWithModules === totalActive) {
      console.log('  ✅ TODOS os ativos têm modules!');
    } else {
      const pct = ((activeWithModules / totalActive) * 100).toFixed(1);
      console.log('  ⚠️  Apenas ' + pct + '% dos ativos têm modules');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
