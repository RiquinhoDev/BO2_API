// ════════════════════════════════════════════════════════════
// Script para encontrar alunos de teste para Tag System V2
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Importar models compilados (usar .default para módulos ES6)
const UserProduct = require('../dist/models/UserProduct').default;
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product/Product').default;

async function findTestStudents() {
  try {
    console.log('🔌 Conectando à BD...');
    await mongoose.connect(process.env.MONGO_URI);

    // Buscar produtos OGI e CLAREZA
    const products = await Product.find({
      $or: [
        { name: /OGI/i },
        { name: /CLAREZA/i }
      ]
    }).select('_id name').lean();

    console.log('\n=== PRODUTOS ENCONTRADOS ===');
    products.forEach(p => {
      console.log(`${p.name} - ${p._id}`);
    });

    const ogiProduct = products.find(p => p.name.includes('OGI'));
    const clarezaProduct = products.find(p => p.name.includes('CLAREZA'));

    // Buscar alunos diversos
    const queries = [
      // 1. Aluno OGI com progresso (para testar módulos)
      {
        productId: ogiProduct?._id,
        status: 'ACTIVE',
        'progress.percentage': { $gt: 10, $lt: 80 }
      },
      // 2. Aluno CLAREZA ativo
      {
        productId: clarezaProduct?._id,
        status: 'ACTIVE',
        'engagement.daysSinceLastAction': { $lt: 5 }
      },
      // 3. Aluno inativo (14+ dias)
      {
        status: 'ACTIVE',
        $or: [
          { 'engagement.daysSinceLastLogin': { $gte: 14 } },
          { 'engagement.daysSinceLastAction': { $gte: 14 } }
        ]
      },
      // 4. Aluno com alto progresso
      {
        status: 'ACTIVE',
        'progress.percentage': { $gte: 80 }
      },
      // 5. Aluno com baixo progresso
      {
        status: 'ACTIVE',
        'progress.percentage': { $gt: 0, $lt: 25 }
      }
    ];

    const testStudents = [];

    for (let i = 0; i < queries.length; i++) {
      const up = await UserProduct.findOne(queries[i])
        .populate('userId', 'email name')
        .populate('productId', 'name')
        .lean();

      if (up && up.userId?.email) {
        testStudents.push(up);
      }
    }

    // Remover duplicados por email
    const uniqueStudents = [];
    const seenEmails = new Set();

    for (const student of testStudents) {
      if (!seenEmails.has(student.userId.email)) {
        seenEmails.add(student.userId.email);
        uniqueStudents.push(student);
      }
    }

    console.log(`\n=== ALUNOS DE TESTE (${uniqueStudents.length}) ===`);

    uniqueStudents.forEach((up, i) => {
      console.log(`\n${i + 1}. ${up.userId.email}`);
      console.log(`   Nome: ${up.userId.name || 'N/A'}`);
      console.log(`   Produto: ${up.productId.name}`);
      console.log(`   Status: ${up.status}`);
      console.log(`   Progresso: ${up.progress?.percentage || 0}%`);

      const daysInactive = up.engagement?.daysSinceLastLogin ??
                          up.engagement?.daysSinceLastAction ??
                          'N/A';
      console.log(`   Dias inativo: ${daysInactive}`);

      const engagementScore = up.engagement?.score ?? 'N/A';
      console.log(`   Engagement Score: ${engagementScore}`);

      if (up.progress?.modulesList && up.progress.modulesList.length > 0) {
        console.log(`   Módulos: ${up.progress.modulesList.length} total`);
        const completed = up.progress.modulesList.filter(m => m.isCompleted || m.completed).length;
        console.log(`   Módulos completos: ${completed}`);
      }

      const currentTags = up.activeCampaignData?.tags || [];
      console.log(`   Tags atuais: ${currentTags.length > 0 ? currentTags.join(', ') : 'Nenhuma'}`);
    });

    console.log('\n=== EMAILS PARA TESTE ===');
    uniqueStudents.forEach((up, i) => {
      console.log(`${i + 1}. ${up.userId.email}`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Concluído!');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

findTestStudents();
