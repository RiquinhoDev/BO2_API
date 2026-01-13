// ════════════════════════════════════════════════════════════
// VERIFICAR: UserProducts do João após o sync
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');

async function verifyJoao() {
  try {
    const uri = 'mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true';
    await mongoose.connect(uri);
    console.log('✅ Conectado à MongoDB\n');

    // Schemas
    const UserProductSchema = new mongoose.Schema({}, { strict: false, collection: 'userproducts' });
    const UserProduct = mongoose.model('UserProduct_Test', UserProductSchema);

    const UserSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
    const User = mongoose.model('User_Test', UserSchema);

    const ProductSchema = new mongoose.Schema({}, { strict: false, collection: 'products' });
    const Product = mongoose.model('Product_Test', ProductSchema);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 VERIFICAÇÃO: João Ferreira (joaomcf37@gmail.com)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Buscar user
    const user = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (!user) {
      console.log('❌ User João não encontrado!');
      await mongoose.connection.close();
      return;
    }

    console.log(`✅ User encontrado:`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Nome: ${user.name}`);
    console.log(`   Email: ${user.email}\n`);

    // Buscar UserProducts
    const userProducts = await UserProduct.find({ userId: user._id }).lean();

    console.log(`📦 UserProducts encontrados: ${userProducts.length}\n`);

    if (userProducts.length === 0) {
      console.log('❌ PROBLEMA: Nenhum UserProduct encontrado!');
      console.log('   O sync pode ter falhado ou há outro problema.\n');
    } else {
      // Buscar produtos
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
        console.log(`   Enrolled: ${up.enrolledAt ? new Date(up.enrolledAt).toLocaleDateString() : 'N/A'}`);
        console.log(`   IsPrimary: ${up.isPrimary}`);
        console.log(`   Progress: ${up.progress?.percentage || 0}%`);
        console.log(`   Engagement Score: ${up.engagement?.engagementScore || 0}`);
        console.log(`   Classes: ${up.classes?.length || 0} turma(s)`);

        if (up.classes && up.classes.length > 0) {
          up.classes.forEach((c, idx) => {
            console.log(`      Turma ${idx + 1}: ClassID = ${c.classId}, Joined = ${c.joinedAt ? new Date(c.joinedAt).toLocaleDateString() : 'N/A'}`);
          });
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 RESULTADO:');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (userProducts.length === 2) {
      console.log('✅ SUCESSO!');
      console.log('   João tem 2 UserProducts conforme esperado:');
      console.log('   - CLAREZA_MENSAL (groupId 6)');
      console.log('   - CLAREZA_ANUAL (groupId 7)\n');
    } else if (userProducts.length === 0) {
      console.log('❌ FALHA!');
      console.log('   João não tem UserProducts.');
      console.log('   O sync não captou este user.\n');
    } else {
      console.log(`⚠️  PARCIAL!`);
      console.log(`   João tem ${userProducts.length} UserProduct(s), mas esperávamos 2.\n`);
    }

    await mongoose.connection.close();
    console.log('✅ Conexão fechada');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verifyJoao();
