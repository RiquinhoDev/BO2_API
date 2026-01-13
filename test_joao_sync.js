// ════════════════════════════════════════════════════════════
// TESTE: Sincronizar apenas Curseduca e verificar João
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');

async function testJoaoSync() {
  try {
    const uri = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true';
    await mongoose.connect(uri);
    console.log('✅ Conectado à MongoDB\n');

    // Importar serviços
    const universalSyncService = require('./dist/services/syncUtilziadoresServices/universalSyncService').default;
    const curseducaAdapter = require('./dist/services/syncUtilziadoresServices/curseducaServices/curseduca.adapter').default;

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔥 TESTE: Sincronizar Curseduca e verificar João');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Fetch dados Curseduca
    console.log('📡 Fetching Curseduca data...\n');
    const curseducaData = await curseducaAdapter.fetchCurseducaDataForSync({
      includeProgress: true,
      includeGroups: true,
      progressConcurrency: 5,
      enrichWithDetails: true
    });

    console.log(`\n✅ Fetched ${curseducaData.length} Curseduca items\n`);

    // Procurar João nos dados
    const joaoItems = curseducaData.filter(item =>
      item.email === 'joaomcf37@gmail.com'
    );

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 RESULTADO: João Ferreira (joaomcf37@gmail.com)');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (joaoItems.length === 0) {
      console.log('❌ FALHA: João NÃO encontrado nos dados do sync!');
      console.log('   O adapter não está a retornar João.\n');
    } else {
      console.log(`✅ SUCESSO: João encontrado com ${joaoItems.length} item(s)!\n`);

      joaoItems.forEach((item, i) => {
        console.log(`─────────────────────────────────────────────────────────`);
        console.log(`Item ${i + 1}/${joaoItems.length}:`);
        console.log(`   Produto: ${item.productCode}`);
        console.log(`   Platform: ${item.platform}`);
        console.log(`   Email: ${item.email}`);
        console.log(`   Nome: ${item.name}`);
        console.log(`   Progress: ${item.progress || 0}%`);
        console.log(`   Status: ${item.status}`);
        console.log(`   Metadata:`, JSON.stringify(item.metadata, null, 2));
        console.log('');
      });
    }

    // Executar sync universal
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔄 Executando Universal Sync...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const syncResult = await universalSyncService.executeUniversalSync({
      syncType: 'curseduca',
      jobName: 'Test João Sync - Curseduca',
      triggeredBy: 'MANUAL',
      sourceData: curseducaData,
      fullSync: true,
      includeProgress: true,
      includeTags: false,
      batchSize: 50
    });

    console.log('\n✅ Sync concluído!');
    console.log(`   Total: ${syncResult.stats.total}`);
    console.log(`   Created: ${syncResult.stats.created}`);
    console.log(`   Updated: ${syncResult.stats.updated}`);
    console.log(`   Skipped: ${syncResult.stats.skipped}`);
    console.log(`   Errors: ${syncResult.stats.errors}\n`);

    // Verificar UserProducts do João
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📦 Verificando UserProducts do João...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const UserProductSchema = new mongoose.Schema({}, { strict: false, collection: 'userproducts' });
    const UserProduct = mongoose.model('UserProduct_JoaoTest', UserProductSchema);

    const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
    const User = mongoose.model('User_JoaoTest', UserSchema);

    const ProductSchema = new mongoose.Schema({}, { strict: false, collection: 'products' });
    const Product = mongoose.model('Product_JoaoTest', ProductSchema);

    const joaoUser = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (!joaoUser) {
      console.log('❌ João não encontrado na DB!');
    } else {
      const userProducts = await UserProduct.find({ userId: joaoUser._id }).lean();
      console.log(`✅ João tem ${userProducts.length} UserProduct(s)\n`);

      if (userProducts.length === 0) {
        console.log('❌ PROBLEMA: Nenhum UserProduct encontrado!\n');
      } else {
        const productIds = userProducts.map(up => up.productId);
        const products = await Product.find({ _id: { $in: productIds } }).lean();
        const productMap = new Map(products.map(p => [p._id.toString(), p]));

        for (let i = 0; i < userProducts.length; i++) {
          const up = userProducts[i];
          const product = productMap.get(up.productId.toString());

          console.log(`─────────────────────────────────────────────────────────`);
          console.log(`UserProduct ${i + 1}/${userProducts.length}:`);
          console.log(`   Produto: ${product?.code || 'N/A'} - ${product?.name || 'N/A'}`);
          console.log(`   Platform: ${up.platform}`);
          console.log(`   Status: ${up.status}`);
          console.log(`   Progress: ${up.progress?.percentage || 0}%`);
          console.log(`   Classes: ${up.classes?.length || 0} turma(s)`);
          console.log('');
        }

        // Verificar se tem os 2 Clareza
        const clarezaProducts = userProducts.filter(up =>
          ['CLAREZA_MENSAL', 'CLAREZA_ANUAL'].includes(productMap.get(up.productId.toString())?.code)
        );

        console.log('═══════════════════════════════════════════════════════════');
        console.log('📊 RESULTADO FINAL:');
        console.log('═══════════════════════════════════════════════════════════\n');

        if (clarezaProducts.length === 2) {
          console.log('✅ ✅ ✅ SUCESSO! ✅ ✅ ✅');
          console.log('   João tem os 2 UserProducts Clareza (Mensal e Anual)!\n');
        } else if (clarezaProducts.length === 1) {
          console.log('⚠️  PARCIAL!');
          console.log('   João tem apenas 1 UserProduct Clareza.');
          console.log('   Esperado: 2 (Mensal e Anual)\n');
        } else {
          console.log('❌ FALHA!');
          console.log('   João não tem UserProducts Clareza.\n');
        }
      }
    }

    await mongoose.connection.close();
    console.log('✅ Conexão fechada');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testJoaoSync();
