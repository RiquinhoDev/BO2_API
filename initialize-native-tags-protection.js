const mongoose = require('mongoose');

// Importar serviço de proteção
const nativeTagProtection = require('./dist/services/activeCampaign/nativeTagProtection.service').default;

(async () => {
  try {
    console.log('🛡️  INICIALIZAR SISTEMA DE PROTEÇÃO DE TAGS NATIVAS\n');
    console.log('━'.repeat(70));
    console.log('Este script captura TODAS as tags da ActiveCampaign para');
    console.log('TODOS os utilizadores ativos e classifica-as em:');
    console.log('  - Tags BO (CODIGO - Descrição) → podem ser removidas');
    console.log('  - Tags Nativas → NUNCA podem ser removidas pelo BO');
    console.log('');
    console.log('⚠️  IMPORTANTE: Isto garante que NUNCA removemos tags nativas!');
    console.log('━'.repeat(70));
    console.log('');

    // Conectar BD
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');
    console.log('✅ Conectado à BD\n');

    // ═══════════════════════════════════════════════════════════
    // BUSCAR TODOS OS USERS ATIVOS
    // ═══════════════════════════════════════════════════════════

    const db = mongoose.connection.db;

    console.log('📊 Buscando utilizadores ativos...\n');

    const users = await db.collection('users').find({
      'metadata.isActive': true,
      email: { $exists: true, $ne: null, $ne: '' }
    }).toArray();

    console.log(`✅ Encontrados ${users.length} utilizadores ativos\n`);

    if (users.length === 0) {
      console.log('⚠️  Nenhum utilizador ativo encontrado. A sair.');
      process.exit(0);
    }

    // Confirmar antes de continuar
    console.log('━'.repeat(70));
    console.log('⚠️  CONFIRMAR AÇÃO');
    console.log('━'.repeat(70));
    console.log('');
    console.log(`Vai capturar tags de ${users.length} utilizadores.`);
    console.log('Tempo estimado: ~' + Math.ceil(users.length / 50) + ' minutos');
    console.log('');
    console.log('Pressione Ctrl+C para cancelar ou aguarde 5 segundos...');
    console.log('');

    await new Promise(resolve => setTimeout(resolve, 5000));

    // ═══════════════════════════════════════════════════════════
    // CAPTURAR TAGS NATIVAS (BATCH)
    // ═══════════════════════════════════════════════════════════

    console.log('🚀 Iniciando captura de tags nativas...\n');

    const emails = users.map(u => u.email).filter(Boolean);

    const result = await nativeTagProtection.captureNativeTagsBatch(
      emails,
      'INITIAL_PROTECTION_SETUP',
      50 // batch size
    );

    console.log('');
    console.log('━'.repeat(70));
    console.log('📊 RESULTADO');
    console.log('━'.repeat(70));
    console.log('');
    console.log(`✅ Processados: ${result.processed}`);
    console.log(`✅ Capturados: ${result.captured}`);
    console.log(`❌ Erros: ${result.errors}`);
    console.log('');

    if (result.success) {
      console.log('🎉 Sistema de proteção inicializado com sucesso!');
    } else {
      console.log('⚠️  Sistema inicializado com alguns erros.');
    }

    console.log('');
    console.log('━'.repeat(70));
    console.log('🛡️  PROTEÇÃO ATIVA');
    console.log('━'.repeat(70));
    console.log('');
    console.log('A partir de agora, o sistema:');
    console.log('  ✅ Captura tags nativas em cada sync');
    console.log('  ✅ Valida TODAS as remoções de tags');
    console.log('  ✅ BLOQUEIA remoções de tags nativas');
    console.log('  ✅ Mantém histórico de mudanças');
    console.log('');

    // Mostrar estatísticas
    console.log('📊 Estatísticas:');
    const stats = await nativeTagProtection.getProtectionStats();
    console.log(`   Total de snapshots: ${stats.totalSnapshots}`);
    console.log(`   Utilizadores com tags nativas: ${stats.snapshotsWithNativeTags}`);
    console.log(`   Média de tags nativas por user: ${stats.avgNativeTagsPerUser.toFixed(2)}`);
    console.log('');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro fatal:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
