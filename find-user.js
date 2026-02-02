const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');

    const User = require('./dist/models/User').default;
    const Product = require('./dist/models/product/Product').default;

    // Buscar user pelo email
    const user = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (!user) {
      console.log('❌ Utilizador não encontrado');
      process.exit(1);
    }

    console.log('📧 USER ENCONTRADO:');
    console.log(`   Nome: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log('');
    console.log('🔍 ESTRUTURA COMPLETA:');
    console.log(JSON.stringify(user, null, 2));

    // Tentar diferentes caminhos para o ID
    const curseducaId = user.curseducaUserId
      || user.curseduca?.curseducaUuid
      || user.curseduca?.curseducaId
      || user.curseduca?.id;

    if (curseducaId) {
      console.log('\n✅ ID CursEduca encontrado:', curseducaId);
    } else {
      console.log('\n❌ Nenhum campo CursEduca encontrado');
    }

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  });
