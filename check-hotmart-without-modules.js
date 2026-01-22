const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const userProducts = db.collection('userproducts');
    const products = db.collection('products');

    console.log('🔍 ANÁLISE: Hotmart vs Outros (COM e SEM modulesList)\n');

    // Buscar IDs de produtos Hotmart
    const hotmartProducts = await products.find({ platform: 'hotmart' }).toArray();
    const hotmartProductIds = hotmartProducts.map(p => p._id);

    console.log('📦 Total de produtos Hotmart:', hotmartProductIds.length);
    console.log('');

    // Total UserProducts
    const totalUserProducts = await userProducts.countDocuments();

    // UserProducts da Hotmart (com e sem modules)
    const totalHotmart = await userProducts.countDocuments({
      productId: { $in: hotmartProductIds }
    });

    const hotmartWithModules = await userProducts.countDocuments({
      productId: { $in: hotmartProductIds },
      'progress.modulesList': { $exists: true, $ne: [] }
    });

    const hotmartWithoutModules = totalHotmart - hotmartWithModules;

    // UserProducts de OUTRAS plataformas (sem modules)
    const totalOthers = totalUserProducts - totalHotmart;

    const othersWithoutModules = await userProducts.countDocuments({
      productId: { $nin: hotmartProductIds },
      $or: [
        { 'progress.modulesList': { $exists: false } },
        { 'progress.modulesList': { $size: 0 } }
      ]
    });

    // Total SEM modules
    const totalWithoutModules = await userProducts.countDocuments({
      $or: [
        { 'progress.modulesList': { $exists: false } },
        { 'progress.modulesList': { $size: 0 } }
      ]
    });

    console.log('📊 RESULTADOS:');
    console.log('');
    console.log('TOTAL GERAL:');
    console.log('  Total UserProducts:', totalUserProducts);
    console.log('  Total SEM modulesList:', totalWithoutModules);
    console.log('');

    console.log('🔥 HOTMART:');
    console.log('  Total Hotmart:', totalHotmart);
    console.log('  Com modules:', hotmartWithModules);
    console.log('  Sem modules:', hotmartWithoutModules);
    console.log('  % Hotmart com modules:', ((hotmartWithModules / totalHotmart) * 100).toFixed(2) + '%');
    console.log('');

    console.log('🌐 OUTRAS PLATAFORMAS:');
    console.log('  Total Outros:', totalOthers);
    console.log('  Sem modules:', othersWithoutModules);
    console.log('');

    console.log('🎯 DOS QUE ESTÃO SEM MODULES (' + totalWithoutModules + '):');
    console.log('  Hotmart:', hotmartWithoutModules, '(' + ((hotmartWithoutModules / totalWithoutModules) * 100).toFixed(1) + '%)');
    console.log('  Outros:', othersWithoutModules, '(' + ((othersWithoutModules / totalWithoutModules) * 100).toFixed(1) + '%)');

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
