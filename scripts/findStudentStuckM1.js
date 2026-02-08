// ════════════════════════════════════════════════════════════
// Script para encontrar aluno que parou após M1
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

const UserProduct = require('../dist/models/UserProduct').default;
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product/Product').default;

async function findStudentStuckM1() {
  try {
    console.log('🔌 Conectando à BD...\n');
    await mongoose.connect(process.env.MONGO_URI);

    // Buscar produto OGI
    const ogiProduct = await Product.findOne({ name: /OGI/i }).lean();

    if (!ogiProduct) {
      console.log('❌ Produto OGI não encontrado');
      return;
    }

    console.log(`✅ Produto OGI encontrado: ${ogiProduct.name}\n`);

    // Buscar UserProducts com módulos
    const userProducts = await UserProduct.find({
      productId: ogiProduct._id,
      status: 'ACTIVE',
      'progress.modulesList': { $exists: true, $ne: [] }
    })
      .populate('userId', 'email name')
      .lean();

    console.log(`📊 Total de UserProducts com módulos: ${userProducts.length}\n`);

    // Filtrar candidatos a "Parou após M1"
    const candidates = [];

    for (const up of userProducts) {
      const modulesList = up.progress?.modulesList || [];

      if (modulesList.length === 0) continue;

      // Ordenar por moduleId numérico
      const sortedModules = [...modulesList].sort((a, b) =>
        parseInt(a.moduleId) - parseInt(b.moduleId)
      );

      // Pegar M1 e M2
      const m1 = sortedModules[0];
      const m2 = sortedModules[1];

      if (!m1 || !m2) continue;

      // Verificar critérios
      const m1Complete = m1.isCompleted === true || m1.completed === true;
      const m2NotStarted = (m2.completedPages || 0) === 0 && !m2.isCompleted && !m2.completed;
      const daysInactive = up.engagement?.daysSinceLastLogin || 0;

      // Se completou M1, não iniciou M2, e está inativo
      if (m1Complete && m2NotStarted && daysInactive >= 5) {
        // Verificar se completou M1 há mais de 5 dias
        let daysSinceM1 = 999;
        if (m1.lastCompletedDate) {
          daysSinceM1 = Math.floor((Date.now() - m1.lastCompletedDate) / (1000 * 60 * 60 * 24));
        }

        if (daysSinceM1 >= 5) {
          candidates.push({
            email: up.userId?.email,
            name: up.userId?.name,
            m1: {
              moduleId: m1.moduleId,
              name: m1.name,
              sequence: m1.sequence,
              isCompleted: m1.isCompleted || m1.completed,
              completedPages: m1.completedPages,
              totalPages: m1.totalPages,
              lastCompletedDate: m1.lastCompletedDate
            },
            m2: {
              moduleId: m2.moduleId,
              name: m2.name,
              sequence: m2.sequence,
              isCompleted: m2.isCompleted || m2.completed,
              completedPages: m2.completedPages,
              totalPages: m2.totalPages
            },
            daysInactive,
            daysSinceM1,
            totalModules: modulesList.length,
            completedModules: modulesList.filter(m => m.isCompleted || m.completed).length
          });
        }
      }
    }

    console.log('═'.repeat(70));
    console.log(`🎯 CANDIDATOS "PAROU APÓS M1": ${candidates.length}`);
    console.log('═'.repeat(70));

    if (candidates.length === 0) {
      console.log('\n⚠️  Nenhum aluno encontrado com este padrão específico.');
      console.log('\nVou mostrar alguns alunos com M1 completo para análise...\n');

      // Mostrar alunos com M1 completo (menos restritivo)
      const m1CompleteStudents = [];

      for (const up of userProducts.slice(0, 20)) {
        const modulesList = up.progress?.modulesList || [];
        if (modulesList.length === 0) continue;

        const sortedModules = [...modulesList].sort((a, b) =>
          parseInt(a.moduleId) - parseInt(b.moduleId)
        );

        const m1 = sortedModules[0];
        const m1Complete = m1?.isCompleted === true || m1?.completed === true;

        if (m1Complete) {
          m1CompleteStudents.push({
            email: up.userId?.email,
            name: up.userId?.name,
            totalModules: modulesList.length,
            completedModules: modulesList.filter(m => m.isCompleted || m.completed).length,
            daysInactive: up.engagement?.daysSinceLastLogin || 0,
            m1: m1.name,
            m2Status: sortedModules[1] ?
              `${sortedModules[1].completedPages || 0}/${sortedModules[1].totalPages || 0} páginas` :
              'N/A'
          });
        }
      }

      console.log('─'.repeat(70));
      console.log(`📋 ALUNOS COM M1 COMPLETO (${m1CompleteStudents.length} primeiros):`);
      console.log('─'.repeat(70));

      m1CompleteStudents.slice(0, 10).forEach((student, i) => {
        console.log(`\n${i + 1}. ${student.email}`);
        console.log(`   Nome: ${student.name || 'N/A'}`);
        console.log(`   Módulos: ${student.completedModules}/${student.totalModules} completos`);
        console.log(`   Dias inativo: ${student.daysInactive}`);
        console.log(`   M1: ${student.m1}`);
        console.log(`   M2: ${student.m2Status}`);
      });

    } else {
      candidates.forEach((candidate, i) => {
        console.log(`\n${i + 1}. ${candidate.email}`);
        console.log(`   Nome: ${candidate.name || 'N/A'}`);
        console.log(`   Módulos totais: ${candidate.totalModules}`);
        console.log(`   Módulos completos: ${candidate.completedModules}`);
        console.log(`   Dias inativo: ${candidate.daysInactive}`);
        console.log(`   Dias desde M1: ${candidate.daysSinceM1}`);
        console.log('');
        console.log(`   M1 (${candidate.m1.moduleId}):`);
        console.log(`      Nome: ${candidate.m1.name}`);
        console.log(`      Sequence: ${candidate.m1.sequence}`);
        console.log(`      Status: ✅ Completo (${candidate.m1.completedPages}/${candidate.m1.totalPages} páginas)`);
        console.log('');
        console.log(`   M2 (${candidate.m2.moduleId}):`);
        console.log(`      Nome: ${candidate.m2.name}`);
        console.log(`      Sequence: ${candidate.m2.sequence}`);
        console.log(`      Status: ❌ Não iniciado (${candidate.m2.completedPages}/${candidate.m2.totalPages} páginas)`);
        console.log('');
      });

      console.log('═'.repeat(70));
      console.log('✅ Encontrados alunos para testar tag "Parou após M1"!');
      console.log('═'.repeat(70));
    }

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

findStudentStuckM1();
