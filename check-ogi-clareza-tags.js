const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    
    // Verificar em todas as collections possíveis
    const collections = await db.listCollections().toArray();
    console.log('📚 Collections disponíveis:');
    collections.forEach(c => console.log('  - ' + c.name));
    console.log('');

    console.log('🔍 PROCURANDO: Tags OGI_ e CLAREZA\n');

    // 1. Verificar na collection contacttags (minúsculas)
    try {
      const contacttags = db.collection('contacttags');
      const totalContactTags = await contacttags.countDocuments();
      console.log('📋 Collection "contacttags":');
      console.log('  Total:', totalContactTags);

      if (totalContactTags > 0) {
        // Contar OGI_ tags
        const ogiCount = await contacttags.countDocuments({
          $or: [
            { tagName: /^OGI_/i },
            { tag: /^OGI_/i },
            { name: /^OGI_/i }
          ]
        });

        // Contar CLAREZA tags
        const clarezaCount = await contacttags.countDocuments({
          $or: [
            { tagName: /CLAREZA/i },
            { tag: /CLAREZA/i },
            { name: /CLAREZA/i }
          ]
        });

        console.log('  Tags OGI_*:', ogiCount);
        console.log('  Tags CLAREZA:', clarezaCount);

        // Mostrar exemplos de OGI_
        if (ogiCount > 0) {
          const ogiExamples = await contacttags.find({
            $or: [
              { tagName: /^OGI_/i },
              { tag: /^OGI_/i },
              { name: /^OGI_/i }
            ]
          }).limit(5).toArray();

          console.log('\n  📌 Exemplos de tags OGI_:');
          ogiExamples.forEach((t, idx) => {
            const tagName = t.tagName || t.tag || t.name || 'N/A';
            console.log('    ' + (idx + 1) + '. Tag:', tagName);
            console.log('       Email:', t.email || 'N/A');
          });

          // Agora verificar se esses mesmos users têm CLAREZA
          console.log('\n  🔍 Verificando se users com OGI_ também têm CLAREZA:');
          
          const emailsWithOGI = ogiExamples.map(t => t.email).filter(e => e);
          
          if (emailsWithOGI.length > 0) {
            for (const email of emailsWithOGI.slice(0, 3)) {
              const userTags = await contacttags.find({ email }).toArray();
              const allTagNames = userTags.map(t => t.tagName || t.tag || t.name).filter(n => n);
              const hasClareza = allTagNames.some(tag => /CLAREZA/i.test(tag));
              
              console.log('\n    Email:', email);
              console.log('    Total tags:', allTagNames.length);
              console.log('    Tem CLAREZA?', hasClareza ? 'SIM' : 'NÃO');
              console.log('    Tags:', allTagNames.slice(0, 10).join(', '));
            }
          }
        }

        // Mostrar estrutura
        const sample = await contacttags.findOne();
        if (sample) {
          console.log('\n  📋 Estrutura de documento:');
          console.log('  Campos:', Object.keys(sample));
        }
      }
    } catch (err) {
      console.log('  ⚠️  Erro ao acessar contacttags:', err.message);
    }

    // 2. Verificar outras collections com "tag" no nome
    const tagCollections = collections.filter(c => c.name.toLowerCase().includes('tag'));
    if (tagCollections.length > 1) {
      console.log('\n📋 Outras collections com "tag":');
      for (const coll of tagCollections) {
        if (coll.name !== 'contacttags') {
          const count = await db.collection(coll.name).countDocuments();
          console.log('  ' + coll.name + ':', count, 'documentos');
        }
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
