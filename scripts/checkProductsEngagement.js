// ════════════════════════════════════════════════════════════
// 🔍 SCRIPT: Check products and qualified users
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

// Define simplified schemas for the collections we need
const UserProductSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
}, { collection: 'userproducts', strict: false });

const ProductSchema = new mongoose.Schema({
  name: String,
  slug: String
}, { collection: 'products', strict: false });

// User schema is more complex but we only need to query it
const UserSchema = new mongoose.Schema({}, { collection: 'users', strict: false });

const UserProduct = mongoose.model('UserProduct', UserProductSchema);
const Product = mongoose.model('Product', ProductSchema);
const User = mongoose.model('User', UserSchema);

async function checkProducts() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🔍 VERIFICAÇÃO DE PRODUTOS E ENGAGEMENT');
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    // Conectar à BD
    console.log('1️⃣  Conectando à base de dados...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('   ✅ Conectado com sucesso\n');

    // Buscar todos os produtos
    console.log('2️⃣  Buscando produtos...');
    const products = await Product.find({}).select('_id name slug');
    console.log(`   ✅ ${products.length} produto(s) encontrado(s)\n`);

    console.log('════════════════════════════════════════════════════════════');
    console.log('📊 ANÁLISE POR PRODUTO');
    console.log('════════════════════════════════════════════════════════════\n');

    for (const product of products) {
      console.log(`🎯 ${product.name} (${product.slug || 'sem slug'})`);
      console.log(`   ID: ${product._id}`);

      // Buscar UserProducts com esse produto
      const userProducts = await UserProduct.find({
        productId: product._id
      }).select('userId');

      const userIds = userProducts.map(up => up.userId);
      const totalUsers = userIds.length;

      if (totalUsers === 0) {
        console.log('   ⚠️  Nenhum utilizador encontrado\n');
        continue;
      }

      // Contar users com engagement/progress adequado
      const qualifiedUsers = await User.countDocuments({
        _id: { $in: userIds },
        $or: [
          { 'hotmart.engagement.engagementLevel': { $in: ['MEDIO', 'ALTO', 'MUITO_ALTO'] } },
          { 'hotmart.engagement.engagementScore': { $gte: 40 } },
          { 'curseduca.engagement.engagementLevel': { $in: ['MEDIO', 'ALTO', 'MUITO_ALTO'] } },
          { 'curseduca.engagement.alternativeEngagement': { $gte: 40 } },
          { 'combined.engagement.level': { $in: ['MEDIO', 'ALTO', 'MUITO_ALTO'] } },
          { 'combined.engagement.score': { $gte: 40 } },
          { 'combined.totalProgress': { $gte: 40 } },
          { 'curseduca.progress.estimatedProgress': { $gte: 40 } }
        ]
      });

      const percentage = Math.round((qualifiedUsers / totalUsers) * 100);

      console.log(`   📊 Total de Utilizadores: ${totalUsers}`);
      console.log(`   ✅ Qualificados (≥MEDIO ou ≥40%): ${qualifiedUsers} (${percentage}%)`);
      console.log(`   ❌ Não Qualificados: ${totalUsers - qualifiedUsers} (${100 - percentage}%)`);

      // Determinar nome da tag
      let tagName = '';
      if (product.slug === 'ogi' || product.name.toLowerCase().includes('ogi')) {
        tagName = 'OGI_TESTEMUNHO';
      } else if (product.slug === 'clareza' || product.name.toLowerCase().includes('clareza')) {
        tagName = 'CLAREZA_TESTEMUNHO';
      } else {
        tagName = `${product.slug?.toUpperCase() || product.name.toUpperCase()}_TESTEMUNHO`;
      }

      console.log(`   🏷️  Tag sugerida: "${tagName}"\n`);
    }

    console.log('════════════════════════════════════════════════════════════');
    console.log('✅ VERIFICAÇÃO COMPLETA');
    console.log('════════════════════════════════════════════════════════════\n');

    return true;

  } catch (error) {
    console.error('\n❌ Erro durante verificação:', error.message);
    console.error(error.stack);
    return false;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado da base de dados');
  }
}

// Executar verificação
checkProducts()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
