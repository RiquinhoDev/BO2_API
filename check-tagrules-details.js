const mongoose = require('mongoose');

(async () => {
  try {
    await mongoose.connect('mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true');

    const db = mongoose.connection.db;
    const tagRules = db.collection('tagrules');

    console.log('🔍 ANÁLISE DETALHADA DAS TAG RULES\n');

    // Buscar todas as regras ativas
    const activeRules = await tagRules.find({ isActive: true }).toArray();

    console.log('Total de regras ativas:', activeRules.length);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    activeRules.forEach((rule, idx) => {
      console.log(`REGRA ${idx + 1}:`);
      console.log('  ID:', rule._id.toString());
      console.log('  tagName:', rule.tagName);
      console.log('  tagId:', rule.tagId);
      console.log('  condition.type:', rule.condition?.type);
      console.log('  condition.threshold:', rule.condition?.threshold);
      console.log('  condition.operator:', rule.condition?.operator);
      console.log('  productId:', rule.productId?.toString());
      console.log('  isActive:', rule.isActive);

      // Testar regex
      const matchesClareza = /CLAREZA/i.test(rule.tagName);
      const matchesOGI = /^OGI_/i.test(rule.tagName);

      console.log('  ✓ Matches CLAREZA:', matchesClareza);
      console.log('  ✓ Matches OGI:', matchesOGI);
      console.log('');
    });

    // Contar por tipo
    const clarezaCount = activeRules.filter(r => /CLAREZA/i.test(r.tagName)).length;
    const ogiCount = activeRules.filter(r => /^OGI_/i.test(r.tagName)).length;
    const otherCount = activeRules.length - clarezaCount - ogiCount;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('RESUMO:');
    console.log('  CLAREZA rules:', clarezaCount);
    console.log('  OGI rules:', ogiCount);
    console.log('  Outras rules:', otherCount);

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
