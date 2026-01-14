// ════════════════════════════════════════════════════════════
// 🔍 SCRIPT: Verify setup before running setAdminUser
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

const UserProductSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  isAdmin: { type: Boolean, default: false }
}, { collection: 'userproducts' });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true }
}, { collection: 'users' });

const UserProduct = mongoose.model('UserProduct', UserProductSchema);
const User = mongoose.model('User', UserSchema);

async function verifySetup() {
  console.log('════════════════════════════════════════════════════════════');
  console.log('🔍 VERIFICAÇÃO DE SETUP');
  console.log('════════════════════════════════════════════════════════════\n');

  try {
    // 1. Verificar .env
    console.log('1️⃣  Verificando ficheiro .env...');
    if (!process.env.MONGO_URI) {
      console.error('   ❌ MONGO_URI não encontrado no .env');
      return false;
    }
    console.log('   ✅ MONGO_URI encontrado');

    // 2. Conectar à BD
    console.log('\n2️⃣  Conectando à base de dados...');
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('   ✅ Conectado com sucesso');

    // 3. Verificar se collection users existe
    console.log('\n3️⃣  Verificando collection "users"...');
    const usersCount = await User.countDocuments();
    console.log(`   ✅ Collection "users" encontrada (${usersCount} documentos)`);

    // 4. Verificar se collection userproducts existe
    console.log('\n4️⃣  Verificando collection "userproducts"...');
    const userProductsCount = await UserProduct.countDocuments();
    console.log(`   ✅ Collection "userproducts" encontrada (${userProductsCount} documentos)`);

    // 5. Verificar se o email alvo existe
    const targetEmail = 'joaomcf37@gmail.com';
    console.log(`\n5️⃣  Procurando utilizador com email: ${targetEmail}...`);
    const user = await User.findOne({ email: targetEmail.toLowerCase().trim() });

    if (!user) {
      console.error(`   ❌ Utilizador não encontrado com email: ${targetEmail}`);
      console.log('   ℹ️  O email deve existir na collection "users" antes de executar o script');
      return false;
    }
    console.log(`   ✅ Utilizador encontrado: ${user._id}`);

    // 6. Verificar quantos UserProducts esse utilizador tem
    console.log(`\n6️⃣  Verificando UserProducts do utilizador...`);
    const userProducts = await UserProduct.find({ userId: user._id });
    console.log(`   ✅ ${userProducts.length} UserProduct(s) encontrado(s)`);

    if (userProducts.length === 0) {
      console.warn('   ⚠️  Nenhum UserProduct encontrado - utilizador não tem produtos associados');
      console.log('   ℹ️  Isto é normal se o utilizador ainda não comprou nenhum produto');
    }

    // 7. Verificar se algum já tem isAdmin: true
    const adminProducts = userProducts.filter(p => p.isAdmin === true);
    if (adminProducts.length > 0) {
      console.log(`\n   ⚠️  ${adminProducts.length} UserProduct(s) já tem isAdmin: true`);
      console.log('   ℹ️  Executar o script irá garantir que TODOS têm isAdmin: true');
    } else {
      console.log('\n   ✅ Nenhum UserProduct tem isAdmin: true ainda');
      console.log('   ℹ️  Pronto para executar setAdminUser.js');
    }

    // Resumo
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('✅ VERIFICAÇÃO COMPLETA - TUDO PRONTO!');
    console.log('════════════════════════════════════════════════════════════');
    console.log('\n📝 Próximos passos:');
    console.log('   1. Executar: node scripts/setAdminUser.js');
    console.log('   2. Reiniciar o servidor API');
    console.log('   3. Testar login com joaomcf37@gmail.com\n');

    return true;

  } catch (error) {
    console.error('\n❌ Erro durante verificação:', error.message);
    return false;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Desconectado da base de dados');
  }
}

// Executar verificação
verifySetup()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Erro fatal:', error);
    process.exit(1);
  });
