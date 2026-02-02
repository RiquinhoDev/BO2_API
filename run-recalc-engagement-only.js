const mongoose = require('mongoose');

// Importar função de recalc
const { recalculateAllEngagementMetrics } = require('./dist/services/syncUtilizadoresServices/engagement/recalculate-engagement-metrics');

(async () => {
  try {
    console.log('🚀 EXECUTAR RECALC ENGAGEMENT COM NOVOS CAMPOS\n');
    console.log('Este processo irá atualizar TODOS os UserProducts com:');
    console.log('  - daysInactive');
    console.log('  - loginsLast30Days');
    console.log('  - weeksActiveLast30Days');
    console.log('');
    console.log('⏱️  Tempo estimado: 12-15 minutos');
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    console.log('✅ Conectado à BD');
    console.log('');

    // Executar recalc
    const startTime = Date.now();
    const result = await recalculateAllEngagementMetrics();
    const duration = Math.floor((Date.now() - startTime) / 1000);

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 RESULTADO DO RECALC');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (result.success) {
      console.log('✅ Recalc completado com sucesso!');
      console.log('');
      console.log('Estatísticas:');
      console.log('  Total:', result.stats.total);
      console.log('  Processados:', result.stats.processed);
      console.log('  Atualizados:', result.stats.updated);
      console.log('  Skipped:', result.stats.skipped);
      console.log('  Early skips:', result.stats.earlySkips);
      console.log('  Erros:', result.stats.errors);
      console.log('  Duração:', duration + 's (' + Math.floor(duration / 60) + ' minutos)');
    } else {
      console.log('❌ Recalc falhou');
      console.log('Erros:', result.errors.length);
      result.errors.slice(0, 5).forEach(err => {
        console.log(`  - ${err.userProductId}: ${err.error}`);
      });
    }

    await mongoose.connection.close();
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error('❌ Erro fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
