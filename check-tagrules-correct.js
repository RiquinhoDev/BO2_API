const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const db = mongoose.connection.db;
    const tagRules = db.collection('tagrules');

    console.log('🔍 ANÁLISE CORRETA DAS TAG RULES\n');

    // Buscar todas as regras ativas
    const activeRules = await tagRules.find({ isActive: true }).toArray();

    console.log('Total de regras ativas:', activeRules.length);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    activeRules.forEach((rule, idx) => {
      console.log(`REGRA ${idx + 1}:`);
      console.log('  ID:', rule._id.toString());
      console.log('  name:', rule.name);
      console.log('  actions.addTag:', rule.actions?.addTag);
      console.log('  actions.removeTags:', rule.actions?.removeTags);
      console.log('  category:', rule.category);
      console.log('  priority:', rule.priority);

      // Condições
      if (rule.conditions && rule.conditions.length > 0) {
        console.log('  conditions:');
        rule.conditions.forEach((cond, i) => {
          console.log(`    [${i}] type: ${cond.type}, field: ${cond.field}, operator: ${cond.operator}, value: ${cond.value}, unit: ${cond.unit}`);
        });
      } else {
        console.log('  conditions: []');
      }

      // Testar regex no addTag
      const tagToApply = rule.actions?.addTag || '';
      const matchesClareza = /CLAREZA/i.test(tagToApply);
      const matchesOGI = /OGI/i.test(tagToApply);

      console.log('  ✓ Tag contém CLAREZA:', matchesClareza);
      console.log('  ✓ Tag contém OGI:', matchesOGI);
      console.log('');
    });

    // Contar por tipo
    const clarezaCount = activeRules.filter(r => /CLAREZA/i.test(r.actions?.addTag || '')).length;
    const ogiCount = activeRules.filter(r => /OGI/i.test(r.actions?.addTag || '')).length;
    const otherCount = activeRules.length - clarezaCount - ogiCount;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('RESUMO:');
    console.log('  Tags com CLAREZA:', clarezaCount);
    console.log('  Tags com OGI:', ogiCount);
    console.log('  Outras tags:', otherCount);

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('CLAREZA Rules:');
    activeRules
      .filter(r => /CLAREZA/i.test(r.actions?.addTag || ''))
      .forEach(r => {
        console.log(`  - ${r.actions.addTag} (${r.category}, prio ${r.priority})`);
      });

    console.log('\nOGI Rules:');
    activeRules
      .filter(r => /OGI/i.test(r.actions?.addTag || ''))
      .forEach(r => {
        console.log(`  - ${r.actions.addTag} (${r.category}, prio ${r.priority})`);
      });

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
