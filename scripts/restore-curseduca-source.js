// scripts/restore-curseduca-source.js
// Script para restaurar o source de turmas CursEduca que foram editadas e perderam o source correto

const mongoose = require('mongoose');
require('dotenv').config();

async function restoreCurseducaSource() {
  try {
    console.log('🔄 Conectando ao MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/riquinhos');
    
    console.log('✅ Conectado ao MongoDB');
    
    const Class = mongoose.model('Class', new mongoose.Schema({}, { strict: false, collection: 'classes' }));
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
    
    // 1. Encontrar turmas que parecem ser CursEduca mas têm source='manual'
    console.log('\n📊 Buscando turmas afetadas...');
    
    const suspectClasses = await Class.find({
      // UUID pattern (CursEduca usa UUIDs)
      classId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      source: 'manual'  // Foi sobrescrito incorretamente
    }).lean();
    
    console.log(`📋 Encontradas ${suspectClasses.length} turmas suspeitas`);
    
    if (suspectClasses.length === 0) {
      console.log('✅ Nenhuma turma afetada encontrada!');
      process.exit(0);
    }
    
    // 2. Para cada turma, verificar se tem alunos CursEduca associados
    const turmasParaRestaurar = [];
    
    for (const cls of suspectClasses) {
      console.log(`\n🔍 Verificando: ${cls.name} (${cls.classId})`);
      
      // Verificar se existem alunos com este groupCurseducaUuid
      const alunosCurseduca = await User.countDocuments({
        'curseduca.groupCurseducaUuid': cls.classId
      });
      
      // Verificar se é realmente uma turma CursEduca procurando por curseducaUuid
      const hasCurseducaUuid = cls.curseducaUuid || cls.curseducaId;
      
      if (alunosCurseduca > 0 || hasCurseducaUuid) {
        console.log(`   ✅ CONFIRMADO: Turma CursEduca com ${alunosCurseduca} alunos`);
        turmasParaRestaurar.push({
          ...cls,
          alunosEncontrados: alunosCurseduca
        });
      } else {
        console.log(`   ⚠️ Não parece ser CursEduca (0 alunos encontrados)`);
      }
    }
    
    console.log(`\n📊 Total de turmas para restaurar: ${turmasParaRestaurar.length}`);
    
    if (turmasParaRestaurar.length === 0) {
      console.log('✅ Nenhuma turma precisa de restauração!');
      process.exit(0);
    }
    
    // 3. Mostrar resumo e pedir confirmação
    console.log('\n📋 RESUMO DAS TURMAS A RESTAURAR:');
    console.log('━'.repeat(80));
    turmasParaRestaurar.forEach((turma, i) => {
      console.log(`${i + 1}. ${turma.name}`);
      console.log(`   ID: ${turma.classId}`);
      console.log(`   Alunos encontrados: ${turma.alunosEncontrados}`);
      console.log(`   Source atual: ${turma.source} → Será alterado para: curseduca_sync`);
      console.log('');
    });
    console.log('━'.repeat(80));
    
    // Para execução automática (sem prompt)
    const shouldProceed = process.argv.includes('--yes') || process.argv.includes('-y');
    
    if (!shouldProceed) {
      console.log('\n⚠️ Para executar a restauração, execute:');
      console.log('   node scripts/restore-curseduca-source.js --yes');
      process.exit(0);
    }
    
    // 4. Executar restauração
    console.log('\n🔄 Iniciando restauração...\n');
    
    let sucessos = 0;
    let erros = 0;
    
    for (const turma of turmasParaRestaurar) {
      try {
        const result = await Class.updateOne(
          { _id: turma._id },
          { 
            $set: { 
              source: 'curseduca_sync',
              // Garantir que curseducaUuid está definido
              curseducaUuid: turma.curseducaUuid || turma.classId
            } 
          }
        );
        
        if (result.modifiedCount > 0) {
          console.log(`✅ Restaurado: ${turma.name}`);
          console.log(`   Alunos agora visíveis: ${turma.alunosEncontrados}`);
          sucessos++;
        } else {
          console.log(`⚠️ Não modificado: ${turma.name} (já estava correto?)`);
        }
      } catch (error) {
        console.error(`❌ Erro ao restaurar ${turma.name}:`, error.message);
        erros++;
      }
    }
    
    // 5. Resumo final
    console.log('\n' + '━'.repeat(80));
    console.log('📊 RESUMO DA RESTAURAÇÃO:');
    console.log(`   ✅ Sucessos: ${sucessos}`);
    console.log(`   ❌ Erros: ${erros}`);
    console.log(`   📋 Total processado: ${turmasParaRestaurar.length}`);
    console.log('━'.repeat(80));
    
    if (sucessos > 0) {
      console.log('\n✨ Restauração concluída com sucesso!');
      console.log('💡 Recomendação: Atualize a página de Gestão de Turmas para ver os alunos');
    }
    
  } catch (error) {
    console.error('❌ Erro crítico:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Desconectado do MongoDB');
  }
}

// Executar
restoreCurseducaSource();


