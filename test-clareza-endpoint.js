const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const users = db.collection('users');
    const acStates = db.collection('ac_contact_states');

    console.log('🔍 TESTE DO ENDPOINT CLAREZA\n');

    // Simular o que o endpoint faz
    const students = await users.find({
      $or: [
        { 'hotmart.hotmartUserId': { $exists: true, $ne: null } },
        { 'curseduca.curseducaUserId': { $exists: true, $ne: null } }
      ]
    })
      .limit(200)
      .toArray();

    console.log('📊 Total alunos encontrados:', students.length);
    
    const emails = students.map(s => s.email).filter(Boolean);
    console.log('📧 Total emails válidos:', emails.length);
    
    // Buscar ac_contact_states
    const acStatesData = await acStates.find({
      email: { $in: emails }
    }).toArray();
    
    console.log('📋 Total ac_contact_states encontrados:', acStatesData.length);
    
    // Criar mapa
    const emailToTagsMap = new Map();
    
    acStatesData.forEach(state => {
      if (state.email && state.tags && Array.isArray(state.tags)) {
        const clarezaTags = state.tags
          .filter(t => t.name && /CLAREZA/i.test(t.name))
          .map(t => t.name);
        
        if (clarezaTags.length > 0) {
          emailToTagsMap.set(state.email, clarezaTags);
          console.log('\n✅ Email:', state.email);
          console.log('   Tags CLAREZA:', clarezaTags);
        }
      }
    });
    
    console.log('\n📊 RESUMO:');
    console.log('Total com tags CLAREZA:', emailToTagsMap.size);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
