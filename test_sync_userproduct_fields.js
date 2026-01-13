// ════════════════════════════════════════════════════════════
// 📋 SCRIPT DE TESTE: Verificar campos UserProduct após sync
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');

async function testUserProductFields() {
  try {
    const uri = 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true';
    await mongoose.connect(uri);
    console.log('✅ Conectado à MongoDB\n');

    const userProductSchema = new mongoose.Schema({}, { strict: false, collection: 'userproducts' });
    const UserProduct = mongoose.models.UserProduct || mongoose.model('UserProduct', userProductSchema);

    const productSchema = new mongoose.Schema({}, { strict: false, collection: 'products' });
    const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

    const classSchema = new mongoose.Schema({}, { strict: false, collection: 'classes' });
    const Class = mongoose.models.Class || mongoose.model('Class', classSchema);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TESTE: Campos Críticos e Importantes no UserProduct');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Buscar 1 exemplo de cada plataforma
    const hotmartExample = await UserProduct.findOne({ platform: 'hotmart' }).lean();
    const curseducaExample = await UserProduct.findOne({ platform: 'curseduca' }).lean();

    // Buscar produtos e classes separadamente
    let hotmartProduct = null;
    let curseducaProduct = null;

    if (hotmartExample) {
      hotmartProduct = await Product.findById(hotmartExample.productId).select('code name').lean();
    }
    if (curseducaExample) {
      curseducaProduct = await Product.findById(curseducaExample.productId).select('code name').lean();
    }

    // ═══════════════════════════════════════════════════════════
    // TESTAR HOTMART
    // ═══════════════════════════════════════════════════════════
    if (hotmartExample) {
      console.log('🔥 HOTMART - Produto:', hotmartProduct?.code || hotmartExample.productId);
      console.log('   UserID:', hotmartExample.userId);
      console.log('');

      console.log('   ✅ CAMPOS CRÍTICOS:');
      console.log('   ├─ classes:', hotmartExample.classes?.length || 0, 'turma(s)');
      if (hotmartExample.classes && hotmartExample.classes.length > 0) {
        for (const c of hotmartExample.classes) {
          // Buscar nome da turma na tabela Class
          const classInfo = await Class.findOne({ classId: c.classId }).select('name').lean();
          console.log(`   │  └─ ClassId: ${c.classId}`);
          console.log(`   │      Nome (Class table): ${classInfo?.name || 'N/A'}`);
          console.log(`   │      Joined: ${c.joinedAt ? new Date(c.joinedAt).toLocaleDateString() : 'N/A'}`);
        }
      } else {
        console.log('   │  ⚠️  VAZIO - Deveria ter classId da Hotmart!');
      }
      console.log('');

      console.log('   ✅ PROGRESS (Hotmart):');
      console.log('   ├─ percentage:', hotmartExample.progress?.percentage || 0, '%');
      console.log('   ├─ currentModule:', hotmartExample.progress?.currentModule || 'N/A');
      console.log('   ├─ modulesCompleted:', hotmartExample.progress?.modulesCompleted?.length || 0, 'módulos');
      console.log('   ├─ lessonsCompleted:', hotmartExample.progress?.lessonsCompleted?.length || 0, 'aulas');
      console.log('   └─ lastActivity:', hotmartExample.progress?.lastActivity
        ? new Date(hotmartExample.progress.lastActivity).toLocaleDateString()
        : 'N/A');
      console.log('');

      console.log('   ✅ ENGAGEMENT (Hotmart):');
      console.log('   ├─ engagementScore:', hotmartExample.engagement?.engagementScore || 0);
      console.log('   ├─ totalLogins:', hotmartExample.engagement?.totalLogins || 'N/A');
      console.log('   ├─ lastLogin:', hotmartExample.engagement?.lastLogin
        ? new Date(hotmartExample.engagement.lastLogin).toLocaleDateString()
        : 'N/A');
      console.log('   ├─ daysSinceLastLogin:', hotmartExample.engagement?.daysSinceLastLogin || 'N/A');
      console.log('   └─ lastAction:', hotmartExample.engagement?.lastAction
        ? new Date(hotmartExample.engagement.lastAction).toLocaleDateString()
        : 'N/A');
      console.log('');
    } else {
      console.log('❌ Nenhum UserProduct Hotmart encontrado!\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════════════
    // TESTAR CURSEDUCA
    // ═══════════════════════════════════════════════════════════
    if (curseducaExample) {
      console.log('🎓 CURSEDUCA - Produto:', curseducaProduct?.code || curseducaExample.productId);
      console.log('   UserID:', curseducaExample.userId);
      console.log('');

      console.log('   ✅ CAMPOS CRÍTICOS:');
      console.log('   ├─ platformUserUuid:', curseducaExample.platformUserUuid || 'N/A');
      console.log('   ├─ classes:', curseducaExample.classes?.length || 0, 'turma(s)');
      if (curseducaExample.classes && curseducaExample.classes.length > 0) {
        for (const c of curseducaExample.classes) {
          // Buscar nome da turma na tabela Class
          const classInfo = await Class.findOne({ classId: c.classId }).select('name').lean();
          console.log(`   │  └─ ClassId: ${c.classId}`);
          console.log(`   │      Nome (Class table): ${classInfo?.name || 'N/A'}`);
          console.log(`   │      Joined: ${c.joinedAt ? new Date(c.joinedAt).toLocaleDateString() : 'N/A'}`);
        }
      } else {
        console.log('   │  ⚠️  VAZIO - Deveria ter groupId da Curseduca!');
      }
      console.log('');

      console.log('   ✅ PROGRESS (Curseduca):');
      console.log('   ├─ percentage:', curseducaExample.progress?.percentage || 0, '%');
      console.log('   └─ lastActivity:', curseducaExample.progress?.lastActivity
        ? new Date(curseducaExample.progress.lastActivity).toLocaleDateString()
        : 'N/A');
      console.log('');

      console.log('   ✅ ENGAGEMENT (Curseduca):');
      console.log('   ├─ engagementScore:', curseducaExample.engagement?.engagementScore || 0);
      console.log('   ├─ lastAction:', curseducaExample.engagement?.lastAction
        ? new Date(curseducaExample.engagement.lastAction).toLocaleDateString()
        : 'N/A');
      console.log('   └─ daysSinceLastAction:', curseducaExample.engagement?.daysSinceLastAction || 'N/A');
      console.log('');
    } else {
      console.log('❌ Nenhum UserProduct Curseduca encontrado!\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    // ═══════════════════════════════════════════════════════════
    // ESTATÍSTICAS GERAIS
    // ═══════════════════════════════════════════════════════════
    console.log('📊 ESTATÍSTICAS GERAIS:\n');

    const totalHotmart = await UserProduct.countDocuments({ platform: 'hotmart' });
    const hotmartWithClasses = await UserProduct.countDocuments({
      platform: 'hotmart',
      'classes.0': { $exists: true }
    });
    const hotmartWithLessons = await UserProduct.countDocuments({
      platform: 'hotmart',
      'progress.lessonsCompleted.0': { $exists: true }
    });

    console.log('🔥 HOTMART:');
    console.log(`   Total: ${totalHotmart}`);
    console.log(`   Com classes: ${hotmartWithClasses} (${totalHotmart > 0 ? ((hotmartWithClasses/totalHotmart)*100).toFixed(1) : 0}%)`);
    console.log(`   Com lessons: ${hotmartWithLessons} (${totalHotmart > 0 ? ((hotmartWithLessons/totalHotmart)*100).toFixed(1) : 0}%)`);
    console.log('');

    const totalCurseduca = await UserProduct.countDocuments({ platform: 'curseduca' });
    const curseducaWithClasses = await UserProduct.countDocuments({
      platform: 'curseduca',
      'classes.0': { $exists: true }
    });

    console.log('🎓 CURSEDUCA:');
    console.log(`   Total: ${totalCurseduca}`);
    console.log(`   Com classes: ${curseducaWithClasses} (${totalCurseduca > 0 ? ((curseducaWithClasses/totalCurseduca)*100).toFixed(1) : 0}%)`);
    console.log('');

    await mongoose.connection.close();
    console.log('✅ Conexão fechada');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testUserProductFields();
