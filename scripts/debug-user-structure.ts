// ═══════════════════════════════════════════════════════════════════════════
// 📁 BO2_API/scripts/debug-user-structure.ts
// 🔍 DEBUG - Ver estrutura REAL dos users na BD
// ═══════════════════════════════════════════════════════════════════════════
//
// EXECUTAR:
// cd BO2_API
// npx ts-node scripts/debug-user-structure.ts
//
// ═══════════════════════════════════════════════════════════════════════════

import mongoose from 'mongoose';
import User from '../src/models/user';

async function debugUserStructure() {
  try {
    // Conectar MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado ao MongoDB\n');

    // Buscar primeiro user de cada tipo
    console.log('🔍 ANALISANDO ESTRUTURA DOS USERS\n');
    console.log('═══════════════════════════════════════════════════════════\n');

    // ─────────────────────────────────────────────────────────────
    // 1. USER COM HOTMART
    // ─────────────────────────────────────────────────────────────
    const userWithHotmart = await User.findOne({ 
      hotmartUserId: { $exists: true, $nin: [null, ''] }
    }).lean() as any;

    if (userWithHotmart) {
      console.log('🔥 USER COM HOTMART:\n');
      console.log(`   Email: ${userWithHotmart.email}`);
      console.log(`   Nome: ${userWithHotmart.name}`);
      console.log(`   hotmartUserId: ${userWithHotmart.hotmartUserId || 'N/A'}`);
      console.log(`   Tem objeto hotmart: ${!!userWithHotmart.hotmart}`);
      
      if (userWithHotmart.hotmart) {
        console.log(`   hotmart.hotmartUserId: ${userWithHotmart.hotmart.hotmartUserId || 'N/A'}`);
        console.log(`   hotmart.engagement: ${!!userWithHotmart.hotmart.engagement}`);
        console.log(`   hotmart.progress: ${!!userWithHotmart.hotmart.progress}`);
        
        if (userWithHotmart.hotmart.engagement) {
          console.log(`      → engagementScore: ${userWithHotmart.hotmart.engagement.engagementScore || 0}`);
        }
        
        if (userWithHotmart.hotmart.progress) {
          console.log(`      → completedLessons: ${userWithHotmart.hotmart.progress.completedLessons || 0}`);
          console.log(`      → lessonsData: ${userWithHotmart.hotmart.progress.lessonsData?.length || 0} lições`);
        }
      }
      
      console.log(`   curseducaUserId: ${userWithHotmart.curseducaUserId || 'N/A'}`);
      console.log(`   Tem objeto curseduca: ${!!userWithHotmart.curseduca}\n`);
    } else {
      console.log('❌ Nenhum user com hotmartUserId encontrado!\n');
    }

    // ─────────────────────────────────────────────────────────────
    // 2. USER COM CURSEDUCA
    // ─────────────────────────────────────────────────────────────
    const userWithCurseduca = await User.findOne({ 
      curseducaUserId: { $exists: true, $nin: [null, ''] }
    }).lean() as any;

    if (userWithCurseduca) {
      console.log('📚 USER COM CURSEDUCA:\n');
      console.log(`   Email: ${userWithCurseduca.email}`);
      console.log(`   Nome: ${userWithCurseduca.name}`);
      console.log(`   curseducaUserId: ${userWithCurseduca.curseducaUserId || 'N/A'}`);
      console.log(`   Tem objeto curseduca: ${!!userWithCurseduca.curseduca}`);
      
      if (userWithCurseduca.curseduca) {
        console.log(`   curseduca.curseducaUserId: ${userWithCurseduca.curseduca.curseducaUserId || 'N/A'}`);
        console.log(`   curseduca.engagement: ${!!userWithCurseduca.curseduca.engagement}`);
        console.log(`   curseduca.progress: ${!!userWithCurseduca.curseduca.progress}`);
        
        if (userWithCurseduca.curseduca.engagement) {
          console.log(`      → engagementScore: ${userWithCurseduca.curseduca.engagement.engagementScore || 0}`);
          console.log(`      → alternativeEngagement: ${userWithCurseduca.curseduca.engagement.alternativeEngagement || 0}`);
        }
        
        if (userWithCurseduca.curseduca.progress) {
          console.log(`      → estimatedProgress: ${userWithCurseduca.curseduca.progress.estimatedProgress || 0}%`);
        }
      }
      
      console.log(`   hotmartUserId: ${userWithCurseduca.hotmartUserId || 'N/A'}`);
      console.log(`   Tem objeto hotmart: ${!!userWithCurseduca.hotmart}\n`);
    } else {
      console.log('❌ Nenhum user com curseducaUserId encontrado!\n');
    }

    // ─────────────────────────────────────────────────────────────
    // 3. STATS GERAIS
    // ─────────────────────────────────────────────────────────────
    console.log('📊 STATS GERAIS:\n');
    
    const totalUsers = await User.countDocuments({ isDeleted: { $ne: true } });
    const usersWithHotmartId = await User.countDocuments({ 
      hotmartUserId: { $exists: true, $nin: [null, ''] }
    });
    const usersWithHotmartData = await User.countDocuments({ 
      'hotmart': { $exists: true, $ne: null } 
    });
    const usersWithCurseducaId = await User.countDocuments({ 
      curseducaUserId: { $exists: true, $nin: [null, ''] }
    });
    const usersWithCurseducaData = await User.countDocuments({ 
      'curseduca': { $exists: true, $ne: null } 
    });
    
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Com hotmartUserId: ${usersWithHotmartId}`);
    console.log(`   Com objeto hotmart: ${usersWithHotmartData}`);
    console.log(`   Com curseducaUserId: ${usersWithCurseducaId}`);
    console.log(`   Com objeto curseduca: ${usersWithCurseducaData}\n`);

    console.log('═══════════════════════════════════════════════════════════\n');

    await mongoose.disconnect();
    console.log('✅ Desconectado do MongoDB\n');

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

debugUserStructure();