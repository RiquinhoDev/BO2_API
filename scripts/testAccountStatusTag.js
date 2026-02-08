const mongoose = require('mongoose');
require('dotenv').config();

const UserProduct = require('../dist/models/UserProduct').default;
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product/Product').default;
const { evaluateAccountStatusTags } = require('../dist/jobs/dailyPipeline/tagEvaluation/accountStatusTags');

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = 'monicarego98@gmail.com';

    console.log('═'.repeat(70));
    console.log(`📧 TESTANDO ACCOUNT_STATUS: ${email}`);
    console.log('═'.repeat(70));

    const user = await User.findOne({ email }).lean();

    console.log('\n👤 DADOS DO USER:');
    console.log(`   Nome: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log('\n🔒 INATIVAÇÃO MANUAL:');
    console.log(`   isManuallyInactivated: ${user.inactivation?.isManuallyInactivated}`);
    console.log(`   inactivatedAt: ${user.inactivation?.inactivatedAt}`);
    console.log(`   reason: ${user.inactivation?.reason}`);

    // Buscar UserProducts (sem populate)
    const userProducts = await UserProduct.find({ userId: user._id }).lean();

    console.log(`\n📦 UserProducts: ${userProducts.length}`);

    for (const up of userProducts) {
      // Buscar produto separadamente
      const product = await Product.findById(up.productId).lean();

      console.log('\n' + '─'.repeat(70));
      console.log(`🎯 PRODUTO: ${product?.name || 'N/A'}`);
      console.log('─'.repeat(70));

      console.log(`\n📊 DADOS DO UserProduct:`);
      console.log(`   Status: ${up.status}`);
      console.log(`   Progresso: ${up.progress?.percentage || 0}%`);

      if (up.metadata?.refunded) {
        console.log(`   Refunded: ${up.metadata.refunded}`);
        console.log(`   Refund Date: ${up.metadata.refundDate}`);
      }

      if (up.curseduca?.memberStatus) {
        console.log(`   Curseduca Status: ${up.curseduca.memberStatus}`);
      }

      if (up.reactivatedAt) {
        const daysAgo = Math.floor((Date.now() - new Date(up.reactivatedAt).getTime()) / (1000 * 60 * 60 * 24));
        console.log(`   Reativado há: ${daysAgo} dias`);
      }

      console.log(`\n🔄 AVALIANDO ACCOUNT_STATUS TAGS...`);

      // Criar objeto mock user com inactivation
      const userWithInactivation = {
        _id: user._id,
        email: user.email,
        name: user.name,
        inactivation: user.inactivation
      };

      // ORDEM CORRETA: (userProduct, user, productName)
      const tags = evaluateAccountStatusTags(up, userWithInactivation, product?.name || 'UNKNOWN');

      console.log(`\n✨ TAGS CALCULADAS (${tags.length}):`);
      if (tags.length > 0) {
        tags.forEach(tag => console.log(`   - ${tag}`));
      } else {
        console.log('   (nenhuma)');
      }
    }

    console.log('\n' + '═'.repeat(70));
    console.log('✅ TESTE CONCLUÍDO');
    console.log('═'.repeat(70));

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

test();
