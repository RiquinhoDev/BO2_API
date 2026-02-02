const mongoose = require('mongoose');
const path = require('path');

// Importar snapshot service
const { pipelineSnapshotService } = require('./dist/services/activeCampaign/pipelineSnapshot.service');

(async () => {
  try {
    console.log('📸 TESTE DO SISTEMA DE SNAPSHOTS\n');
    console.log('Este script demonstra como capturar snapshots PRE/POST pipeline.\n');
    console.log('━'.repeat(70));

    // Conectar BD
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');
    console.log('✅ Conectado à BD\n');

    // ═══════════════════════════════════════════════════════════
    // CAPTURAR SNAPSHOT PRE
    // ═══════════════════════════════════════════════════════════

    console.log('PASSO 1: Capturando snapshot PRE (estado atual)...\n');
    const preSnapshot = await pipelineSnapshotService.captureSnapshot('PRE');

    console.log('📊 SNAPSHOT PRE:');
    console.log(`   Total UserProducts: ${preSnapshot.totalUserProducts}`);
    console.log(`   UserProducts Ativos: ${preSnapshot.activeUserProducts}`);
    console.log(`   Total Utilizadores: ${preSnapshot.stats.totalUsers}`);
    console.log(`   Total Tags: ${preSnapshot.stats.totalTags}`);
    console.log(`   Avg Engagement Score: ${preSnapshot.stats.avgEngagementScore}`);
    console.log('');

    console.log('📦 Breakdown por Produto:');
    Object.entries(preSnapshot.stats.productBreakdown).forEach(([code, stats]) => {
      console.log(`   ${code}: ${stats.total} UserProducts (avg score: ${stats.avgScore.toFixed(2)})`);
    });
    console.log('');

    // Salvar snapshot PRE
    const preFile = await pipelineSnapshotService.saveSnapshot(preSnapshot, 'snapshot_PRE_latest.json');
    console.log(`💾 Snapshot PRE salvo: ${path.basename(preFile)}\n`);

    console.log('━'.repeat(70));

    // ═══════════════════════════════════════════════════════════
    // SIMULAR MUDANÇAS (exemplo)
    // ═══════════════════════════════════════════════════════════

    console.log('\n⚠️  NOTA: Para capturar snapshot POST, execute o Daily Pipeline e depois:');
    console.log('   node test-snapshot-compare.js\n');

    console.log('━'.repeat(70));
    console.log('\n✅ Teste concluído!');
    console.log('');
    console.log('📋 PRÓXIMOS PASSOS:');
    console.log('   1. Snapshot PRE capturado ✓');
    console.log('   2. Execute o Daily Pipeline (ou Tag Rules Only)');
    console.log('   3. Execute: node test-snapshot-compare.js');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
