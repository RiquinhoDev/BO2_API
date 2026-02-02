const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const acStates = db.collection('ac_contact_states');

    console.log('🔍 PROCURANDO: Tags OGI_ e CLAREZA em ac_contact_states\n');

    const totalStates = await acStates.countDocuments();
    console.log('📊 Total documentos:', totalStates);
    console.log('');

    // Buscar todos os documentos com tags
    const allWithTags = await acStates.find({
      'tags': { $exists: true, $ne: [] }
    }).toArray();

    console.log('Documentos com tags:', allWithTags.length);
    console.log('');

    // Processar manualmente para encontrar OGI_ e CLAREZA
    let usersWithOGI = [];
    let usersWithClareza = [];

    for (const doc of allWithTags) {
      const tags = doc.tags || [];
      const tagNames = tags.map(t => t.name || '');
      
      const hasOGI = tagNames.some(name => name.startsWith('OGI_'));
      const hasClareza = tagNames.some(name => /CLAREZA/i.test(name));
      
      if (hasOGI) {
        usersWithOGI.push({
          email: doc.email,
          ogiTags: tagNames.filter(name => name.startsWith('OGI_')),
          allTags: tagNames
        });
      }
      
      if (hasClareza) {
        usersWithClareza.push({
          email: doc.email,
          clarezaTags: tagNames.filter(name => /CLAREZA/i.test(name)),
          allTags: tagNames
        });
      }
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('📊 RESULTADOS:');
    console.log('═══════════════════════════════════════════════════');
    console.log('Users com tags OGI_*:', usersWithOGI.length);
    console.log('Users com tags CLAREZA:', usersWithClareza.length);
    console.log('');

    if (usersWithOGI.length > 0) {
      console.log('✅ USERS COM TAGS OGI_:');
      usersWithOGI.forEach((user, idx) => {
        console.log('\n' + (idx + 1) + '. ' + user.email);
        console.log('   Tags OGI_:', user.ogiTags.join(', '));
        
        // Verificar se tem CLAREZA
        const hasClareza = user.allTags.some(t => /CLAREZA/i.test(t));
        console.log('   Tem CLAREZA?', hasClareza ? 'SIM ✅' : 'NÃO ❌');
        
        if (hasClareza) {
          const clarezaTags = user.allTags.filter(t => /CLAREZA/i.test(t));
          console.log('   Tags CLAREZA:', clarezaTags.join(', '));
        }
      });
    }

    if (usersWithClareza.length > 0) {
      console.log('\n═══════════════════════════════════════════════════');
      console.log('✅ USERS COM TAGS CLAREZA:');
      usersWithClareza.forEach((user, idx) => {
        console.log('\n' + (idx + 1) + '. ' + user.email);
        console.log('   Tags CLAREZA:', user.clarezaTags.join(', '));
      });
    }

    // Verificar overlap
    const emailsWithOGI = new Set(usersWithOGI.map(u => u.email));
    const emailsWithClareza = new Set(usersWithClareza.map(u => u.email));
    const overlap = [...emailsWithOGI].filter(e => emailsWithClareza.has(e));

    console.log('\n═══════════════════════════════════════════════════');
    console.log('🎯 OVERLAP (têm AMBOS OGI_ e CLAREZA):');
    console.log('═══════════════════════════════════════════════════');
    console.log('Total:', overlap.length);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
