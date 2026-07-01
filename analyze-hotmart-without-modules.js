const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');
    const products = db.collection('products');

    // Buscar IDs de produtos Hotmart
    const hotmartProducts = await products.find({ platform: 'hotmart' }).toArray();
    const hotmartProductIds = hotmartProducts.map(p => p._id);

    console.log('🔍 ANÁLISE DETALHADA: 2.300 Hotmart SEM modulesList\n');

    // Buscar todos os Hotmart SEM modules
    const hotmartWithoutModules = await userProducts.find({
      productId: { $in: hotmartProductIds },
      $or: [
        { 'progress.modulesList': { $exists: false } },
        { 'progress.modulesList': { $size: 0 } }
      ]
    }).toArray();

    const total = hotmartWithoutModules.length;
    console.log('📊 Total a analisar:', total);
    console.log('');

    // Análise 1: Progresso > 0%
    const withProgress = hotmartWithoutModules.filter(up => 
      up.progress?.percentage && up.progress.percentage > 0
    );
    const withoutProgress = total - withProgress.length;

    // Análise 2: Status (ativo/inativo)
    const active = hotmartWithoutModules.filter(up => up.status === 'active');
    const inactive = hotmartWithoutModules.filter(up => up.status !== 'active');

    // Análise 3: Data de compra > 365 dias
    const now = Date.now();
    const oneYearAgo = now - (365 * 24 * 60 * 60 * 1000);
    
    const oldPurchases = hotmartWithoutModules.filter(up => {
      if (!up.purchaseDate) return false;
      const purchaseTime = typeof up.purchaseDate === 'number' ? up.purchaseDate : new Date(up.purchaseDate).getTime();
      return purchaseTime < oneYearAgo;
    });

    const recentPurchases = hotmartWithoutModules.filter(up => {
      if (!up.purchaseDate) return false;
      const purchaseTime = typeof up.purchaseDate === 'number' ? up.purchaseDate : new Date(up.purchaseDate).getTime();
      return purchaseTime >= oneYearAgo;
    });

    const noPurchaseDate = hotmartWithoutModules.filter(up => !up.purchaseDate);

    // Análise 4: Último acesso (se existir campo)
    const hasLastAccess = hotmartWithoutModules.filter(up => 
      up.lastLogin || up.lastAccessDate || up.progress?.lastAccessDate
    );

    console.log('═══════════════════════════════════════════════════');
    console.log('📈 PROGRESSO:');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Com progresso > 0%:', withProgress.length, '(' + ((withProgress.length / total) * 100).toFixed(1) + '%)');
    console.log('  Sem progresso (0%):', withoutProgress, '(' + ((withoutProgress / total) * 100).toFixed(1) + '%)');
    console.log('');

    console.log('═══════════════════════════════════════════════════');
    console.log('✅ STATUS:');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Ativos:', active.length, '(' + ((active.length / total) * 100).toFixed(1) + '%)');
    console.log('  Inativos:', inactive.length, '(' + ((inactive.length / total) * 100).toFixed(1) + '%)');
    console.log('');

    console.log('═══════════════════════════════════════════════════');
    console.log('📅 DATA DE COMPRA:');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Compra > 365 dias:', oldPurchases.length, '(' + ((oldPurchases.length / total) * 100).toFixed(1) + '%)');
    console.log('  Compra < 365 dias:', recentPurchases.length, '(' + ((recentPurchases.length / total) * 100).toFixed(1) + '%)');
    console.log('  Sem data de compra:', noPurchaseDate.length, '(' + ((noPurchaseDate.length / total) * 100).toFixed(1) + '%)');
    console.log('');

    console.log('═══════════════════════════════════════════════════');
    console.log('🕐 ÚLTIMO ACESSO:');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Com informação de último acesso:', hasLastAccess.length, '(' + ((hasLastAccess.length / total) * 100).toFixed(1) + '%)');
    console.log('  Sem informação:', (total - hasLastAccess.length), '(' + (((total - hasLastAccess.length) / total) * 100).toFixed(1) + '%)');
    console.log('');

    console.log('═══════════════════════════════════════════════════');
    console.log('🎯 PERFIL TÍPICO (maior grupo):');
    console.log('═══════════════════════════════════════════════════');
    
    // Encontrar o perfil mais comum
    const profiles = {
      'Inativos sem progresso antigos': hotmartWithoutModules.filter(up => {
        const isInactive = up.status !== 'active';
        const noProgress = !up.progress?.percentage || up.progress.percentage === 0;
        const isOld = up.purchaseDate && (typeof up.purchaseDate === 'number' ? up.purchaseDate : new Date(up.purchaseDate).getTime()) < oneYearAgo;
        return isInactive && noProgress && isOld;
      }).length,
      
      'Ativos sem progresso': hotmartWithoutModules.filter(up => {
        const isActive = up.status === 'active';
        const noProgress = !up.progress?.percentage || up.progress.percentage === 0;
        return isActive && noProgress;
      }).length,
      
      'Com progresso mas sem modules': withProgress.length,
      
      'Compra recente sem atividade': hotmartWithoutModules.filter(up => {
        const isRecent = up.purchaseDate && (typeof up.purchaseDate === 'number' ? up.purchaseDate : new Date(up.purchaseDate).getTime()) >= oneYearAgo;
        const noProgress = !up.progress?.percentage || up.progress.percentage === 0;
        return isRecent && noProgress;
      }).length
    };

    for (const [profile, count] of Object.entries(profiles)) {
      if (count > 0) {
        console.log('  ' + profile + ':', count, '(' + ((count / total) * 100).toFixed(1) + '%)');
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('💡 RECOMENDAÇÃO:');
    console.log('═══════════════════════════════════════════════════');
    
    if (withProgress.length > total * 0.3) {
      console.log('  ⚠️  Há ' + withProgress.length + ' alunos COM progresso mas SEM modules!');
      console.log('  🔄 Recomendo executar um novo sync para preencher os módulos.');
    } else if (withoutProgress > total * 0.7) {
      console.log('  ✅ A maioria (' + withoutProgress + ') não tem progresso.');
      console.log('  📌 Os modules estão corretos - alunos sem progresso não têm aulas/módulos.');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
