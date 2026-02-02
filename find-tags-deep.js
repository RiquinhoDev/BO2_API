const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;

    console.log('🔍 BUSCA PROFUNDA: Tags OGI_ e CLAREZA\n');

    // 1. Verificar users collection
    const users = db.collection('users');
    const totalUsers = await users.countDocuments();
    
    console.log('👥 Collection USERS (' + totalUsers + ' total):');
    
    // Pegar um user qualquer para ver estrutura
    const sampleUser = await users.findOne({});
    if (sampleUser) {
      console.log('\n📋 Estrutura de campos de um user:');
      const topLevelKeys = Object.keys(sampleUser);
      console.log('Campos principais:', topLevelKeys.join(', '));
      
      // Ver se tem dados AC
      if (sampleUser.activeCampaign) {
        console.log('\nCampos em activeCampaign:', Object.keys(sampleUser.activeCampaign).join(', '));
      }
    }
    
    // Buscar users com qualquer dado no activeCampaign
    const usersWithAC = await users.countDocuments({
      'activeCampaign': { $exists: true }
    });
    
    console.log('\nUsers com campo activeCampaign:', usersWithAC);
    
    if (usersWithAC > 0) {
      // Pegar exemplo com AC
      const userWithAC = await users.findOne({
        'activeCampaign': { $exists: true }
      });
      
      console.log('\n📌 Exemplo de user com activeCampaign:');
      console.log('Email:', userWithAC.email);
      console.log('AC data:', JSON.stringify(userWithAC.activeCampaign, null, 2).substring(0, 500));
    }

    // 2. Verificar ac_contact_states
    console.log('\n═══════════════════════════════════════════════════');
    const acStates = db.collection('ac_contact_states');
    const totalACStates = await acStates.countDocuments();
    
    console.log('\n📋 Collection AC_CONTACT_STATES (' + totalACStates + ' total):');
    
    if (totalACStates > 0) {
      const sampleState = await acStates.findOne({});
      console.log('\nCampos:', Object.keys(sampleState).join(', '));
      console.log('Exemplo:', JSON.stringify(sampleState, null, 2).substring(0, 500));
      
      // Procurar por tags
      const withTags = await acStates.countDocuments({
        'tags': { $exists: true, $ne: [] }
      });
      console.log('\nDocumentos com tags:', withTags);
      
      if (withTags > 0) {
        const exampleWithTags = await acStates.findOne({
          'tags': { $exists: true, $ne: [] }
        });
        console.log('\n📌 Exemplo com tags:');
        console.log('Email:', exampleWithTags.email);
        console.log('Tags:', exampleWithTags.tags?.slice(0, 10));
        
        // Contar OGI_ e CLAREZA
        const withOGI = await acStates.countDocuments({
          'tags': { $regex: /^OGI_/i }
        });
        
        const withClareza = await acStates.countDocuments({
          'tags': { $regex: /CLAREZA/i }
        });
        
        console.log('\nTags OGI_*:', withOGI);
        console.log('Tags CLAREZA:', withClareza);
      }
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
