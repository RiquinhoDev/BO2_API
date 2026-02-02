const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;

    console.log('🔍 ANÁLISE DAS REGRAS DE TAGS E DECISÕES\n');

    // 1. Ver regras de tags ativas
    const tagRules = db.collection('tagrules');
    const activeRules = await tagRules.find({ isActive: true }).toArray();

    console.log('📋 REGRAS DE TAGS ATIVAS:', activeRules.length);
    console.log('');

    const clarezaRules = activeRules.filter(r => /CLAREZA/i.test(r.tagName));
    const ogiRules = activeRules.filter(r => /OGI/i.test(r.tagName));

    console.log('CLAREZA Rules:', clarezaRules.length);
    clarezaRules.forEach(r => {
      console.log('  -', r.tagName, '|', r.condition?.type, '>', r.condition?.threshold);
    });

    console.log('');
    console.log('OGI Rules:', ogiRules.length);
    ogiRules.forEach(r => {
      console.log('  -', r.tagName, '|', r.condition?.type, '>', r.condition?.threshold);
    });

    // 2. Analisar 3 utilizadores específicos
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 ANÁLISE DETALHADA DE 3 UTILIZADORES');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const users = db.collection('users');
    const userProducts = db.collection('userproducts');
    const products = db.collection('products');

    const testEmails = ['joaomcf37@gmail.com', 'rui.santos@serriquinho.com', 'afonsorpereira97@gmail.com'];

    for (const email of testEmails) {
      const user = await users.findOne({ email });
      if (!user) {
        console.log('❌ ' + email + ' - USER NÃO ENCONTRADO\n');
        continue;
      }

      console.log('📧 ' + email);
      console.log('User ID:', user._id.toString());

      const ups = await userProducts.find({ userId: user._id }).toArray();

      if (ups.length === 0) {
        console.log('⚠️  SEM USERPRODUCTS\n');
        continue;
      }

      for (const up of ups) {
        const product = await products.findOne({ _id: up.productId });
        const productName = product?.name || product?.code || 'Unknown';
        const prodId = up.productId.toString().substring(0, 12);

        console.log('\n  📦 Produto: ' + productName + ' (' + prodId + '...)');

        // Métricas de engagement
        if (up.engagement) {
          console.log('  📊 Engagement Metrics:');
          console.log('    Score:', up.engagement.score || 0);
          console.log('    Nível:', up.engagement.level || 'N/A');
          console.log('    Dias inativo:', up.engagement.daysInactive || 0);
          console.log('    Progresso:', (up.progress?.percentage || 0) + '%');
        } else {
          console.log('  ⚠️  SEM ENGAGEMENT CALCULADO');
        }

        // Tags na BD
        const bdTags = up.activeCampaignData?.tags || [];
        console.log('  🏷️  Tags na BD:', bdTags.length);
        if (bdTags.length > 0) {
          bdTags.forEach(tag => console.log('    ✓', tag));
        }

        // Decisão esperada baseada nas regras
        console.log('  🤔 Decisão Esperada (baseado nas regras):');

        const daysInactive = up.engagement?.daysInactive || 0;
        const progress = up.progress?.percentage || 0;

        // Simular decisão CLAREZA
        if (/CLAREZA/i.test(productName)) {
          if (daysInactive >= 30) {
            console.log('    → CLAREZA - Inativo 30d (dias:', daysInactive + ')');
          } else if (daysInactive >= 14) {
            console.log('    → CLAREZA - Inativo 14d (dias:', daysInactive + ')');
          } else if (daysInactive >= 7) {
            console.log('    → CLAREZA - Inativo 7d (dias:', daysInactive + ')');
          } else {
            console.log('    → CLAREZA - Ativo (dias:', daysInactive + ')');
          }
        }

        // Simular decisão OGI
        if (/OGI/i.test(productName)) {
          if (daysInactive >= 21) {
            console.log('    → OGI_V1 - Inativo 21d (dias:', daysInactive + ')');
          } else if (daysInactive >= 10) {
            console.log('    → OGI_V1 - Inativo 10d (dias:', daysInactive + ')');
          } else if (daysInactive >= 7) {
            console.log('    → OGI_V1 - Inativo 7d (dias:', daysInactive + ')');
          } else if (progress < 30) {
            console.log('    → OGI_V1 - Progresso Baixo (progresso:', progress + '%)');
          } else {
            console.log('    → OGI_V1 - Ativo (dias:', daysInactive, ', progresso:', progress + '%)');
          }
        }
      }

      console.log('\n' + '─'.repeat(70) + '\n');
    }

    // 3. Estatísticas gerais
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📈 ESTATÍSTICAS GERAIS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const totalUPs = await userProducts.countDocuments();
    const upsWithEngagement = await userProducts.countDocuments({ engagement: { $exists: true } });
    const upsWithTags = await userProducts.countDocuments({ 'activeCampaignData.tags': { $exists: true, $ne: [] } });

    console.log('Total UserProducts:', totalUPs);
    console.log('Com Engagement calculado:', upsWithEngagement, '(' + ((upsWithEngagement/totalUPs)*100).toFixed(1) + '%)');
    console.log('Com Tags na BD:', upsWithTags, '(' + ((upsWithTags/totalUPs)*100).toFixed(1) + '%)');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
