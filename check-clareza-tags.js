const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const users = db.collection('users');

    console.log('🔍 PROCURANDO: Alunos com tags do Clareza\n');

    // Procurar por diferentes formas de tags relacionadas ao Clareza
    const queries = [
      { 'activeCampaign.tags': /clareza/i },
      { 'activeCampaign.tags': /CLAREZA/i },
      { tags: /clareza/i },
      { 'hotmart.tags': /clareza/i }
    ];

    let totalWithClarezaTags = 0;
    const examples = [];

    for (const query of queries) {
      const count = await users.countDocuments(query);
      if (count > 0) {
        console.log('Query:', JSON.stringify(query), '- Encontrados:', count);
        totalWithClarezaTags += count;
        
        if (examples.length < 3) {
          const sample = await users.findOne(query);
          if (sample && !examples.find(e => e._id.toString() === sample._id.toString())) {
            examples.push(sample);
          }
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('📊 RESULTADO:');
    console.log('═══════════════════════════════════════════════════');
    
    if (totalWithClarezaTags === 0) {
      console.log('❌ Nenhum aluno encontrado com tags do Clareza');
      
      // Verificar estrutura de tags disponíveis
      console.log('\n🔍 Verificando estrutura de tags...');
      const sampleUser = await users.findOne({ 'activeCampaign.tags': { $exists: true, $ne: [] } });
      
      if (sampleUser) {
        console.log('\n📋 Exemplo de estrutura de tags:');
        console.log('Email:', sampleUser.email);
        console.log('Tags AC:', sampleUser.activeCampaign?.tags?.slice(0, 5) || 'N/A');
        
        // Mostrar todas as tags únicas (primeiras 20)
        const allTags = await users.aggregate([
          { $unwind: '$activeCampaign.tags' },
          { $group: { _id: '$activeCampaign.tags' } },
          { $limit: 20 }
        ]).toArray();
        
        console.log('\n🏷️  Primeiras 20 tags existentes:');
        allTags.forEach((t, i) => {
          console.log('  ' + (i + 1) + '. ' + t._id);
        });
      } else {
        console.log('⚠️  Nenhum utilizador tem tags do ActiveCampaign');
      }
      
    } else {
      console.log('✅ Total de alunos com tags Clareza:', totalWithClarezaTags);
      
      if (examples.length > 0) {
        console.log('\n📋 EXEMPLOS:');
        examples.forEach((user, idx) => {
          console.log('\n' + (idx + 1) + '. ' + user.email);
          console.log('   Tags AC:', user.activeCampaign?.tags?.filter(t => /clareza/i.test(t)) || 'N/A');
          console.log('   Todas as tags:', user.activeCampaign?.tags?.slice(0, 5) || 'N/A');
        });
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
