const mongoose = require('mongoose');
const path = require('path');

// Importar snapshot service
const { pipelineSnapshotService } = require('./dist/services/activeCampaign/pipelineSnapshot.service');

(async () => {
  try {
    console.log('🔍 COMPARAÇÃO DE SNAPSHOTS PRE vs POST\n');
    console.log('━'.repeat(70));

    // Conectar BD
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');
    console.log('✅ Conectado à BD\n');

    // ═══════════════════════════════════════════════════════════
    // CARREGAR SNAPSHOT PRE (se existir)
    // ═══════════════════════════════════════════════════════════

    let preSnapshot;
    const preFilePath = path.join(process.cwd(), 'snapshots', 'snapshot_PRE_latest.json');

    try {
      console.log('📂 Carregando snapshot PRE...');
      preSnapshot = await pipelineSnapshotService.loadSnapshot(preFilePath);
      console.log(`   ✅ Snapshot PRE carregado: ${preSnapshot.activeUserProducts} UserProducts\n`);
    } catch (err) {
      console.log('⚠️  Snapshot PRE não encontrado. Execute primeiro: node test-snapshot-system.js');
      console.log('');
      process.exit(1);
    }

    // ═══════════════════════════════════════════════════════════
    // CAPTURAR SNAPSHOT POST (estado atual após pipeline)
    // ═══════════════════════════════════════════════════════════

    console.log('📸 Capturando snapshot POST (estado atual)...\n');
    const postSnapshot = await pipelineSnapshotService.captureSnapshot('POST');

    console.log('📊 SNAPSHOT POST:');
    console.log(`   Total UserProducts: ${postSnapshot.totalUserProducts}`);
    console.log(`   UserProducts Ativos: ${postSnapshot.activeUserProducts}`);
    console.log(`   Total Utilizadores: ${postSnapshot.stats.totalUsers}`);
    console.log(`   Total Tags: ${postSnapshot.stats.totalTags}`);
    console.log(`   Avg Engagement Score: ${postSnapshot.stats.avgEngagementScore}`);
    console.log('');

    // Salvar snapshot POST
    const postFile = await pipelineSnapshotService.saveSnapshot(postSnapshot, 'snapshot_POST_latest.json');
    console.log(`💾 Snapshot POST salvo: ${path.basename(postFile)}\n`);

    console.log('━'.repeat(70));

    // ═══════════════════════════════════════════════════════════
    // COMPARAR SNAPSHOTS
    // ═══════════════════════════════════════════════════════════

    console.log('\n🔍 Comparando snapshots...\n');
    const comparison = pipelineSnapshotService.compareSnapshots(preSnapshot, postSnapshot);

    console.log('━'.repeat(70));
    console.log('📊 RESUMO DE MUDANÇAS');
    console.log('━'.repeat(70));
    console.log('');

    console.log(`✅ Tags Adicionadas: ${comparison.diff.summary.totalTagsAdded}`);
    console.log(`❌ Tags Removidas: ${comparison.diff.summary.totalTagsRemoved}`);
    console.log(`👤 Utilizadores Afetados: ${comparison.diff.summary.usersAffected}`);
    console.log(`📦 Produtos Afetados: ${comparison.diff.summary.productsAffected.size}`);
    console.log('');

    // Mostrar primeiras 5 adições
    if (comparison.diff.tagsAdded.length > 0) {
      console.log('━'.repeat(70));
      console.log('✅ TAGS ADICIONADAS (primeiras 5)');
      console.log('━'.repeat(70));
      comparison.diff.tagsAdded.slice(0, 5).forEach((item, i) => {
        console.log(`${i + 1}. ${item.email} (${item.productCode})`);
        console.log(`   ${item.tags.join(', ')}`);
      });
      if (comparison.diff.tagsAdded.length > 5) {
        console.log(`\n   ... e mais ${comparison.diff.tagsAdded.length - 5} alterações`);
      }
      console.log('');
    }

    // Mostrar primeiras 5 remoções
    if (comparison.diff.tagsRemoved.length > 0) {
      console.log('━'.repeat(70));
      console.log('❌ TAGS REMOVIDAS (primeiras 5)');
      console.log('━'.repeat(70));
      comparison.diff.tagsRemoved.slice(0, 5).forEach((item, i) => {
        console.log(`${i + 1}. ${item.email} (${item.productCode})`);
        console.log(`   ${item.tags.join(', ')}`);
      });
      if (comparison.diff.tagsRemoved.length > 5) {
        console.log(`\n   ... e mais ${comparison.diff.tagsRemoved.length - 5} alterações`);
      }
      console.log('');
    }

    // Mostrar mudanças de engagement
    if (comparison.diff.engagementChanged.length > 0) {
      console.log('━'.repeat(70));
      console.log('📈 MUDANÇAS DE ENGAGEMENT SCORE (>5 pontos)');
      console.log('━'.repeat(70));
      comparison.diff.engagementChanged.slice(0, 5).forEach((item, i) => {
        const delta = item.after - item.before;
        const sign = delta > 0 ? '+' : '';
        console.log(`${i + 1}. ${item.email} (${item.productCode})`);
        console.log(`   ${item.before} → ${item.after} (${sign}${delta})`);
      });
      if (comparison.diff.engagementChanged.length > 5) {
        console.log(`\n   ... e mais ${comparison.diff.engagementChanged.length - 5} alterações`);
      }
      console.log('');
    }

    console.log('━'.repeat(70));

    // ═══════════════════════════════════════════════════════════
    // SALVAR COMPARAÇÃO E RELATÓRIO
    // ═══════════════════════════════════════════════════════════

    console.log('');
    console.log('💾 Salvando comparação e relatório...\n');

    const comparisonFile = await pipelineSnapshotService.saveComparison(comparison, 'comparison_latest.json');
    console.log(`   ✅ Comparação JSON: ${path.basename(comparisonFile)}`);

    const reportFile = await pipelineSnapshotService.saveMarkdownReport(comparison, 'report_latest.md');
    console.log(`   ✅ Relatório Markdown: ${path.basename(reportFile)}`);

    console.log('');
    console.log('━'.repeat(70));
    console.log('✅ COMPARAÇÃO CONCLUÍDA!');
    console.log('━'.repeat(70));
    console.log('');
    console.log('📂 Ficheiros salvos em: ./snapshots/');
    console.log('   - snapshot_PRE_latest.json');
    console.log('   - snapshot_POST_latest.json');
    console.log('   - comparison_latest.json');
    console.log('   - report_latest.md');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
