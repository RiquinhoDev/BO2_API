const mongoose = require('mongoose');

const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:***REMOVED-DB-PASSWORD***@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Conectado à BD\n');
    console.log('🔍 DIAGNÓSTICO: Verificando estrutura do campo daysInactive\n');
    console.log('═'.repeat(60));

    const UserProduct = require('./dist/models/UserProduct').default;
    const Product = require('./dist/models/product/Product').default;
    const User = require('./dist/models/User').default;

    // Buscar João Ferreira
    const joao = await User.findOne({ email: 'joaomcf37@gmail.com' }).lean();

    if (!joao) {
      console.log('❌ João não encontrado');
      process.exit(1);
    }

    // Buscar produtos CursEduca
    const curseducaProducts = await Product.find({ platform: 'curseduca' })
      .select('_id name')
      .lean();

    const productIds = curseducaProducts.map(p => p._id);

    // Buscar primeiro produto do João
    const joaoUP = await UserProduct.findOne({
      userId: joao._id,
      productId: { $in: productIds }
    }).lean();

    if (!joaoUP) {
      console.log('❌ João não tem UserProducts CursEduca');
      process.exit(1);
    }

    console.log('📄 ESTRUTURA COMPLETA DO USERPRODUCT:\n');
    console.log(JSON.stringify(joaoUP, null, 2));

    console.log('\n' + '═'.repeat(60));
    console.log('\n🔎 ANÁLISE DO CAMPO ENGAGEMENT:\n');
    console.log('engagement:', joaoUP.engagement);
    console.log('\nengagement.lastAction:', joaoUP.engagement?.lastAction);
    console.log('engagement.daysInactive:', joaoUP.engagement?.daysInactive);
    console.log('engagement.engagementScore:', joaoUP.engagement?.engagementScore);

    console.log('\n' + '═'.repeat(60));
    console.log('\n🧪 TESTE DE ATUALIZAÇÃO DIRETA:\n');

    const now = new Date();
    const lastActionDate = new Date(joaoUP.engagement.lastAction);
    const calculatedDays = Math.floor((now.getTime() - lastActionDate.getTime()) / (1000 * 60 * 60 * 24));

    console.log(`LastAction: ${lastActionDate}`);
    console.log(`Agora: ${now}`);
    console.log(`Dias calculados: ${calculatedDays}`);

    // Testar update direto
    const result = await UserProduct.updateOne(
      { _id: joaoUP._id },
      { $set: { 'engagement.daysInactive': calculatedDays } }
    );

    console.log('\nResultado do updateOne:', result);

    // Re-ler o documento
    const updatedUP = await UserProduct.findById(joaoUP._id).lean();

    console.log('\n' + '═'.repeat(60));
    console.log('\n📋 DOCUMENTO APÓS UPDATE:\n');
    console.log('engagement:', updatedUP.engagement);
    console.log('\nengagement.daysInactive:', updatedUP.engagement?.daysInactive);
    console.log('Tipo de daysInactive:', typeof updatedUP.engagement?.daysInactive);

    // Verificar schema do modelo
    console.log('\n' + '═'.repeat(60));
    console.log('\n📐 SCHEMA DO MODELO UserProduct:\n');

    const schema = UserProduct.schema;
    const engagementPath = schema.path('engagement');

    console.log('Engagement schema:', engagementPath);

    if (engagementPath && engagementPath.schema) {
      const daysInactivePath = engagementPath.schema.path('daysInactive');
      console.log('\ndaysInactive path:', daysInactivePath);
      console.log('daysInactive type:', daysInactivePath?.instance);
    }

    console.log('\n' + '═'.repeat(60));
    console.log('\n✅ Diagnóstico concluído!\n');

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro:', err.message);
    console.error(err);
    process.exit(1);
  });
