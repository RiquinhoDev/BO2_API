const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const users = db.collection('users');
    const contactTags = db.collection('contacttags');

    console.log('🔍 VERIFICANDO: Todas as estruturas de tags\n');

    // 1. Verificar se existe collection ContactTags
    const contactTagsCount = await contactTags.countDocuments();
    console.log('📋 Collection ContactTags:');
    console.log('  Total documentos:', contactTagsCount);
    
    if (contactTagsCount > 0) {
      // Procurar por Clareza
      const clarezaTags = await contactTags.countDocuments({
        $or: [
          { tagName: /clareza/i },
          { tag: /clareza/i },
          { name: /clareza/i }
        ]
      });
      
      console.log('  Com "Clareza":', clarezaTags);
      
      if (clarezaTags > 0) {
        const examples = await contactTags.find({
          $or: [
            { tagName: /clareza/i },
            { tag: /clareza/i },
            { name: /clareza/i }
          ]
        }).limit(3).toArray();
        
        console.log('\n  📌 Exemplos de tags Clareza:');
        examples.forEach((tag, idx) => {
          console.log('    ' + (idx + 1) + '. Tag:', tag.tagName || tag.tag || tag.name);
          console.log('       Email:', tag.email);
          console.log('       User ID:', tag.userId);
        });
      }
      
      // Mostrar estrutura de um documento
      const sampleTag = await contactTags.findOne();
      console.log('\n  �� Estrutura de exemplo:');
      console.log('  Campos:', Object.keys(sampleTag || {}));
    }

    console.log('\n═══════════════════════════════════════════════════');
    
    // 2. Verificar users com campo tags
    const usersWithTags = await users.countDocuments({
      $or: [
        { tags: { $exists: true, $ne: [] } },
        { 'activeCampaign.tags': { $exists: true, $ne: [] } },
        { 'hotmart.tags': { $exists: true, $ne: [] } }
      ]
    });
    
    console.log('\n📋 Users com tags:');
    console.log('  Total:', usersWithTags);
    
    if (usersWithTags > 0) {
      const sampleUserWithTags = await users.findOne({
        $or: [
          { tags: { $exists: true, $ne: [] } },
          { 'activeCampaign.tags': { $exists: true, $ne: [] } }
        ]
      });
      
      console.log('\n  📌 Exemplo:');
      console.log('    Email:', sampleUserWithTags?.email);
      console.log('    Tags:', sampleUserWithTags?.tags?.slice(0, 3) || sampleUserWithTags?.activeCampaign?.tags?.slice(0, 3));
    }

    // 3. Verificar total de users
    const totalUsers = await users.countDocuments();
    console.log('\n📊 Total users na BD:', totalUsers);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
