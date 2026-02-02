const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    
    console.log('🔍 VERIFICANDO STATUS DO PIPELINE\n');

    // 1. Ver última execução do pipeline
    const pipelineExecutions = db.collection('pipelineexecutions');
    const lastExecution = await pipelineExecutions.findOne({}, { sort: { endTime: -1 } });

    if (lastExecution) {
      console.log('📋 ÚLTIMA EXECUÇÃO DO PIPELINE:');
      console.log('  Status:', lastExecution.status);
      console.log('  Início:', lastExecution.startTime);
      console.log('  Fim:', lastExecution.endTime || 'EM EXECUÇÃO');
      console.log('  Duração:', lastExecution.duration ? lastExecution.duration + 's' : 'N/A');
      console.log('');
      
      if (lastExecution.steps) {
        console.log('  STEPS:');
        if (lastExecution.steps.syncHotmart) {
          console.log('    ✓ Step 1 - Hotmart:', lastExecution.steps.syncHotmart.success ? 'OK' : 'FALHOU');
        }
        if (lastExecution.steps.syncCursEduca) {
          console.log('    ✓ Step 2 - CursEduca:', lastExecution.steps.syncCursEduca.success ? 'OK' : 'FALHOU');
        }
        if (lastExecution.steps.preCreateTags) {
          console.log('    ✓ Step 3 - Pre-create Tags:', lastExecution.steps.preCreateTags.success ? 'OK' : 'FALHOU');
        }
        if (lastExecution.steps.recalcEngagement) {
          console.log('    ✓ Step 4 - Recalc Engagement:', lastExecution.steps.recalcEngagement.success ? 'OK' : 'FALHOU');
        }
        if (lastExecution.steps.evaluateTagRules) {
          console.log('    ✓ Step 5 - Tag Rules:', lastExecution.steps.evaluateTagRules.success ? 'OK' : 'FALHOU');
          if (lastExecution.steps.evaluateTagRules.stats) {
            console.log('      Tags aplicadas:', lastExecution.steps.evaluateTagRules.stats.tagsApplied || 0);
            console.log('      Tags removidas:', lastExecution.steps.evaluateTagRules.stats.tagsRemoved || 0);
          }
        }
        if (lastExecution.steps.syncTestimonialTags) {
          console.log('    ✓ Step 6 - Testimonial Tags:', lastExecution.steps.syncTestimonialTags.success ? 'OK' : 'FALHOU');
        }
      }
      console.log('');
    } else {
      console.log('❌ Nenhuma execução encontrada');
    }

    // 2. Verificar tags na BD vs AC
    console.log('📊 VERIFICANDO SINCRONIZAÇÃO DE TAGS:');
    console.log('');

    const userProducts = db.collection('userproducts');
    const acStates = db.collection('ac_contact_states');
    const users = db.collection('users');

    // Buscar os 3 users que sabemos que têm tags
    const testEmails = ['joaomcf37@gmail.com', 'rui.santos@serriquinho.com', 'afonsorpereira97@gmail.com'];
    
    for (const email of testEmails) {
      const user = await users.findOne({ email });
      if (!user) continue;

      const ups = await userProducts.find({ userId: user._id }).toArray();
      const acState = await acStates.findOne({ email });

      console.log(`📧 ${email}:`);
      
      if (ups.length > 0) {
        for (const up of ups) {
          const bdTags = up.activeCampaignData?.tags || [];
          const bdClarezaTags = bdTags.filter(t => /CLAREZA/i.test(t));
          const bdOGITags = bdTags.filter(t => /^OGI_/i.test(t));
          
          if (bdClarezaTags.length > 0) {
            console.log('  BD (Clareza):', bdClarezaTags.length, 'tags');
          }
          if (bdOGITags.length > 0) {
            console.log('  BD (OGI):', bdOGITags.length, 'tags');
          }
        }
      } else {
        console.log('  BD: Sem UserProducts');
      }

      if (acState?.tags) {
        const acClarezaTags = acState.tags.filter(t => /CLAREZA/i.test(t.name));
        const acOGITags = acState.tags.filter(t => /^OGI_/i.test(t.name));
        console.log('  AC (Clareza):', acClarezaTags.length, 'tags');
        console.log('  AC (OGI):', acOGITags.length, 'tags');
      } else {
        console.log('  AC: Sem dados');
      }
      console.log('');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
})();
