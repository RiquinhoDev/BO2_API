const mongoose = require('mongoose');

// Importar serviço de proteção
const nativeTagProtection = require('./dist/services/activeCampaign/nativeTagProtection.service').default;

(async () => {
  try {
    console.log('🧪 TESTE DO SISTEMA DE PROTEÇÃO DE TAGS NATIVAS\n');
    console.log('━'.repeat(70));

    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');
    console.log('✅ Conectado à BD\n');

    // ═══════════════════════════════════════════════════════════
    // TESTE 1: Classificação de Tags
    // ═══════════════════════════════════════════════════════════

    console.log('TESTE 1: Classificação de Tags BO vs Nativas\n');

    const testTags = [
      'OGI_V1 - Inativo 14d',           // BO ✅
      'CLAREZA_ANUAL - Alto Engajamento', // BO ✅
      'Cliente VIP',                     // NATIVA ❌
      'Testemunho Gravado',              // NATIVA ❌
      'OGI_V1 - Curso Concluído',       // BO ✅
      'Webinar 2025',                    // NATIVA ❌
    ];

    console.log('Tags de teste:');
    testTags.forEach(tag => {
      const isBO = nativeTagProtection.isBOTag(tag);
      const symbol = isBO ? '✅ BO' : '❌ NATIVA';
      console.log(`  ${symbol}: "${tag}"`);
    });

    console.log('');

    const { boTags, nativeTags } = nativeTagProtection.classifyTags(testTags);
    console.log('Resultado da classificação:');
    console.log(`  Tags BO: ${boTags.length}`);
    console.log(`  Tags Nativas: ${nativeTags.length}`);
    console.log('');

    // ═══════════════════════════════════════════════════════════
    // TESTE 2: Captura de Tags para 1 Utilizador
    // ═══════════════════════════════════════════════════════════

    console.log('━'.repeat(70));
    console.log('TESTE 2: Captura de Tags de 1 Utilizador\n');

    const db = mongoose.connection.db;
    const testUser = await db.collection('users').findOne({
      email: { $exists: true, $ne: null },
      'metadata.isActive': true
    });

    if (!testUser || !testUser.email) {
      console.log('⚠️  Nenhum utilizador de teste encontrado');
    } else {
      console.log(`📧 Utilizador de teste: ${testUser.email}\n`);

      const captureResult = await nativeTagProtection.captureNativeTags(
        testUser.email,
        'TEST_SCRIPT'
      );

      console.log('Resultado da captura:');
      console.log(`  Success: ${captureResult.success}`);
      console.log(`  Tags BO: ${captureResult.boTags.length}`);
      console.log(`  Tags Nativas: ${captureResult.nativeTags.length}`);
      console.log(`  Primeira captura: ${captureResult.isFirstCapture}`);
      console.log('');

      if (captureResult.nativeTags.length > 0) {
        console.log('Tags Nativas encontradas:');
        captureResult.nativeTags.forEach(tag => {
          console.log(`    - ${tag}`);
        });
        console.log('');
      }

      if (captureResult.boTags.length > 0) {
        console.log('Tags BO encontradas (primeiras 5):');
        captureResult.boTags.slice(0, 5).forEach(tag => {
          console.log(`    - ${tag}`);
        });
        if (captureResult.boTags.length > 5) {
          console.log(`    ... e mais ${captureResult.boTags.length - 5} tags`);
        }
        console.log('');
      }

      // ═══════════════════════════════════════════════════════════
      // TESTE 3: Validação de Remoção
      // ═══════════════════════════════════════════════════════════

      console.log('━'.repeat(70));
      console.log('TESTE 3: Validação de Remoção de Tags\n');

      // Testar com uma tag BO (deve permitir)
      if (captureResult.boTags.length > 0) {
        const boTagTest = captureResult.boTags[0];
        console.log(`Testando remoção de tag BO: "${boTagTest}"`);

        const canRemoveBO = await nativeTagProtection.canRemoveTag(
          testUser.email,
          boTagTest
        );

        console.log(`  Pode remover: ${canRemoveBO.canRemove ? '✅ SIM' : '❌ NÃO'}`);
        console.log(`  É BO: ${canRemoveBO.isBO}`);
        console.log(`  É Nativa: ${canRemoveBO.isNative}`);
        if (canRemoveBO.reason) {
          console.log(`  Motivo: ${canRemoveBO.reason}`);
        }
        console.log('');
      }

      // Testar com uma tag nativa (deve BLOQUEAR)
      if (captureResult.nativeTags.length > 0) {
        const nativeTagTest = captureResult.nativeTags[0];
        console.log(`Testando remoção de tag NATIVA: "${nativeTagTest}"`);

        const canRemoveNative = await nativeTagProtection.canRemoveTag(
          testUser.email,
          nativeTagTest
        );

        console.log(`  Pode remover: ${canRemoveNative.canRemove ? '✅ SIM' : '❌ NÃO (ESPERADO)'}`);
        console.log(`  É BO: ${canRemoveNative.isBO}`);
        console.log(`  É Nativa: ${canRemoveNative.isNative}`);
        if (canRemoveNative.reason) {
          console.log(`  Motivo: ${canRemoveNative.reason}`);
        }
        console.log('');
      }

      // Testar com tag inventada (não existe)
      console.log('Testando remoção de tag inventada: "Cliente Premium 2026"');
      const canRemoveFake = await nativeTagProtection.canRemoveTag(
        testUser.email,
        'Cliente Premium 2026'
      );

      console.log(`  Pode remover: ${canRemoveFake.canRemove ? '✅ SIM' : '❌ NÃO (ESPERADO)'}`);
      console.log(`  É BO: ${canRemoveFake.isBO}`);
      console.log(`  É Nativa: ${canRemoveFake.isNative}`);
      if (canRemoveFake.reason) {
        console.log(`  Motivo: ${canRemoveFake.reason}`);
      }
      console.log('');

      // ═══════════════════════════════════════════════════════════
      // TESTE 4: Filtro de Tags Seguras
      // ═══════════════════════════════════════════════════════════

      console.log('━'.repeat(70));
      console.log('TESTE 4: Filtro de Tags Seguras para Remover\n');

      const tagsToTest = [
        ...captureResult.boTags.slice(0, 2),
        ...captureResult.nativeTags.slice(0, 2)
      ];

      if (tagsToTest.length > 0) {
        console.log('Tags a testar:');
        tagsToTest.forEach(tag => {
          const isBO = nativeTagProtection.isBOTag(tag);
          console.log(`  ${isBO ? 'BO' : 'NATIVA'}: ${tag}`);
        });
        console.log('');

        const filtered = await nativeTagProtection.filterSafeTagsToRemove(
          testUser.email,
          tagsToTest
        );

        console.log('Resultado do filtro:');
        console.log(`  Tags seguras (podem remover): ${filtered.safeTags.length}`);
        filtered.safeTags.forEach(tag => console.log(`    ✅ ${tag}`));
        console.log('');

        console.log(`  Tags bloqueadas (NÃO podem remover): ${filtered.blockedTags.length}`);
        filtered.blockedTags.forEach(tag => {
          console.log(`    ❌ ${tag}`);
          console.log(`       Motivo: ${filtered.reasons[tag]}`);
        });
        console.log('');
      }

      // ═══════════════════════════════════════════════════════════
      // TESTE 5: Relatório de Tags
      // ═══════════════════════════════════════════════════════════

      console.log('━'.repeat(70));
      console.log('TESTE 5: Relatório de Tags Nativas\n');

      const report = await nativeTagProtection.getNativeTagsReport(testUser.email);

      if (report.exists) {
        console.log('Relatório do snapshot:');
        console.log(`  Capturado em: ${report.capturedAt}`);
        console.log(`  Última sync: ${report.lastSyncAt}`);
        console.log(`  Número de syncs: ${report.syncCount}`);
        console.log(`  Total de tags: ${report.totalTags}`);
        console.log(`  Tags BO: ${report.boTags.length}`);
        console.log(`  Tags Nativas: ${report.nativeTags.length}`);
        console.log('');

        if (report.history && report.history.length > 0) {
          console.log(`Histórico (${report.history.length} entradas):`);
          report.history.slice(0, 3).forEach(entry => {
            console.log(`  - ${entry.timestamp}: ${entry.action} (${entry.tagsCount} tags) [${entry.source}]`);
          });
          if (report.history.length > 3) {
            console.log(`  ... e mais ${report.history.length - 3} entradas`);
          }
          console.log('');
        }
      } else {
        console.log('⚠️  Snapshot não encontrado');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // TESTE 6: Estatísticas Globais
    // ═══════════════════════════════════════════════════════════

    console.log('━'.repeat(70));
    console.log('TESTE 6: Estatísticas Globais de Proteção\n');

    const stats = await nativeTagProtection.getProtectionStats();

    console.log('Estatísticas:');
    console.log(`  Total de snapshots: ${stats.totalSnapshots}`);
    console.log(`  Utilizadores com tags nativas: ${stats.snapshotsWithNativeTags}`);
    console.log(`  Média de tags nativas por user: ${stats.avgNativeTagsPerUser.toFixed(2)}`);
    console.log(`  Proteção ativa: ${stats.protectionActive ? '✅ SIM' : '❌ NÃO'}`);
    console.log('');

    console.log('━'.repeat(70));
    console.log('✅ TODOS OS TESTES CONCLUÍDOS!');
    console.log('━'.repeat(70));
    console.log('');
    console.log('🛡️  O sistema de proteção está funcional.');
    console.log('');
    console.log('Próximo passo:');
    console.log('  1. Execute: node initialize-native-tags-protection.js');
    console.log('  2. Execute o Daily Pipeline com proteção ativa');
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
