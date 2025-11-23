// scripts/diagnostic-dashboard-v2.ts
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import User from '../src/models/user';
import UserProduct from '../src/models/UserProduct';
import Product from '../src/models/Product';

async function diagnosticDashboardV2() {
  console.log('🔍 DIAGNÓSTICO DASHBOARD V2 - ARQUITETURA FINAL\n');
  
  const report: any = {
    timestamp: new Date().toISOString(),
    models: {},
    queries: {},
    recommendations: []
  };

  try {
    // Conectar ao MongoDB
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
      throw new Error('MONGO_URI não configurado no .env!');
    }
    console.log(`🔌 Conectando ao MongoDB...`);
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    // ═══════════════════════════════════════════════════════
    // 1️⃣ VERIFICAR MODELOS E DADOS ESSENCIAIS
    // ═══════════════════════════════════════════════════════
    
    console.log('📊 1. AUDITORIA DE MODELOS\n');
    
    // --- USER MODEL ---
    const totalUsers = await User.countDocuments();
    const usersWithEngagement = await User.countDocuments({ 
      $or: [
        { 'hotmart.engagement.engagementScore': { $exists: true, $ne: null } },
        { 'curseduca.engagement.engagementLevel': { $exists: true, $ne: null } }
      ]
    });
    const usersWithEmail = await User.countDocuments({ 
      email: { $exists: true, $ne: null } 
    });
    
    report.models.users = {
      total: totalUsers,
      withEngagement: usersWithEngagement,
      withoutEngagement: totalUsers - usersWithEngagement,
      withEmail: usersWithEmail,
      missingEmail: totalUsers - usersWithEmail,
      percentageReady: totalUsers > 0 ? ((usersWithEngagement / totalUsers) * 100).toFixed(2) + '%' : '0%'
    };
    
    console.log('👤 USER MODEL:');
    console.log(`   Total: ${totalUsers}`);
    console.log(`   ✅ Com engagementScore: ${usersWithEngagement} (${report.models.users.percentageReady})`);
    console.log(`   ❌ Sem engagementScore: ${totalUsers - usersWithEngagement}`);
    console.log(`   📧 Com email: ${usersWithEmail}`);
    
    if (usersWithEngagement === 0 && totalUsers > 0) {
      report.recommendations.push('🚨 CRÍTICO: engagementScore não calculado! Executar calculateEngagement() primeiro');
    }

    // --- PRODUCT MODEL ---
    const totalProducts = await Product.countDocuments();
    const products = await Product.find().select('name platform code');
    
    report.models.products = {
      total: totalProducts,
      byPlatform: {},
      products: products.map(p => ({
        id: p._id,
        name: p.name,
        platform: p.platform,
        code: p.code
      }))
    };
    
    const platformCount = await Product.aggregate([
      { $group: { _id: '$platform', count: { $sum: 1 } } }
    ]);
    
    platformCount.forEach(p => {
      report.models.products.byPlatform[p._id] = p.count;
    });
    
    console.log('\n📦 PRODUCT MODEL:');
    console.log(`   Total: ${totalProducts}`);
    Object.entries(report.models.products.byPlatform).forEach(([platform, count]) => {
      console.log(`   ${platform}: ${count} produtos`);
    });
    
    if (totalProducts === 0) {
      report.recommendations.push('🚨 CRÍTICO: Nenhum produto configurado! Migrar produtos V1 primeiro');
    }

    // --- USERPRODUCT MODEL ---
    const totalUserProducts = await UserProduct.countDocuments();
    const upWithProgress = await UserProduct.countDocuments({ 
      'progress.percentage': { $exists: true, $ne: null } 
    });
    const upWithLastActivity = await UserProduct.countDocuments({ 
      'progress.lastActivity': { $exists: true, $ne: null } 
    });
    
    report.models.userProducts = {
      total: totalUserProducts,
      withProgress: upWithProgress,
      withoutProgress: totalUserProducts - upWithProgress,
      withLastActivity: upWithLastActivity,
      withoutLastActivity: totalUserProducts - upWithLastActivity,
      percentageReady: totalUserProducts > 0 ? ((upWithProgress / totalUserProducts) * 100).toFixed(2) + '%' : '0%'
    };
    
    console.log('\n🔗 USERPRODUCT MODEL:');
    console.log(`   Total: ${totalUserProducts}`);
    console.log(`   ✅ Com progress: ${upWithProgress} (${report.models.userProducts.percentageReady})`);
    console.log(`   ✅ Com lastActivity: ${upWithLastActivity}`);
    
    if (totalUserProducts > 0 && upWithProgress < totalUserProducts * 0.5) {
      report.recommendations.push('⚠️ ATENÇÃO: Menos de 50% dos UserProducts têm progress definido');
    }

    // ═══════════════════════════════════════════════════════
    // 2️⃣ TESTAR QUERIES CRÍTICAS (PERFORMANCE)
    // ═══════════════════════════════════════════════════════
    
    console.log('\n⚡ 2. TESTE DE PERFORMANCE\n');
    
    // Query 1: Carregar todos os alunos
    const start1 = Date.now();
    const allUsers = await User.find().limit(4000);
    const time1 = Date.now() - start1;
    report.queries.loadAllUsers = { time: time1, count: allUsers.length };
    console.log(`   Carregar users: ${time1}ms (${allUsers.length} users)`);
    
    if (time1 > 2000) {
      report.recommendations.push('⚠️ PERFORMANCE: Query de users demora >2s. Adicionar índices!');
    }

    // Query 2: Agregação com filtros
    const start2 = Date.now();
    const aggregated = await UserProduct.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'products',
          localField: 'productId',
          foreignField: '_id',
          as: 'product'
        }
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$productId',
          totalStudents: { $sum: 1 },
          avgEngagement: { $avg: '$user.hotmart.engagement.engagementScore' },
          avgProgress: { $avg: '$progress.percentage' }
        }
      }
    ]);
    const time2 = Date.now() - start2;
    report.queries.aggregation = { time: time2, results: aggregated.length };
    console.log(`   Agregação por produto: ${time2}ms (${aggregated.length} produtos)`);
    
    if (time2 > 3000) {
      report.recommendations.push('🚨 CRÍTICO: Agregação demora >3s. Índices compostos obrigatórios!');
    }

    // Query 3: Filtros combinados + paginação
    const start3 = Date.now();
    const filtered = await UserProduct.find({
      'progress.percentage': { $gte: 50 }
    })
      .populate('userId', 'name email hotmart curseduca')
      .populate('productId', 'name platform')
      .limit(50)
      .skip(0);
    const time3 = Date.now() - start3;
    report.queries.filteredPaginated = { time: time3, count: filtered.length };
    console.log(`   Filtros + paginação (50 items): ${time3}ms`);
    
    if (time3 > 1000) {
      report.recommendations.push('⚠️ PERFORMANCE: Paginação lenta. Índice em progress obrigatório!');
    }

    // ═══════════════════════════════════════════════════════
    // 3️⃣ VERIFICAR ÍNDICES EXISTENTES
    // ═══════════════════════════════════════════════════════
    
    console.log('\n🗂️ 3. ÍNDICES EXISTENTES\n');
    
    const userIndexes = await User.collection.getIndexes();
    const productIndexes = await Product.collection.getIndexes();
    const upIndexes = await UserProduct.collection.getIndexes();
    
    report.indexes = {
      users: Object.keys(userIndexes),
      products: Object.keys(productIndexes),
      userProducts: Object.keys(upIndexes)
    };
    
    console.log('   Users:', Object.keys(userIndexes).join(', '));
    console.log('   Products:', Object.keys(productIndexes).join(', '));
    console.log('   UserProducts:', Object.keys(upIndexes).join(', '));

    // ═══════════════════════════════════════════════════════
    // 4️⃣ TESTAR CÁLCULO DE ENGAGEMENT
    // ═══════════════════════════════════════════════════════
    
    console.log('\n🎯 4. VALIDAR ENGAGEMENT SCORE\n');
    
    const sampleUser = await User.findOne({ 
      $or: [
        { 'hotmart.engagement.engagementScore': { $exists: true } },
        { 'curseduca.engagement.engagementLevel': { $exists: true } }
      ]
    });
    
    if (sampleUser) {
      console.log(`   ✅ Exemplo encontrado: ${sampleUser.name || sampleUser.email}`);
      const hotmartScore = (sampleUser as any).hotmart?.engagement?.engagementScore;
      const curseducaLevel = (sampleUser as any).curseduca?.engagement?.engagementLevel;
      console.log(`   Hotmart Score: ${hotmartScore || 'N/A'}`);
      console.log(`   CursEduca Level: ${curseducaLevel || 'N/A'}`);
    } else {
      console.log(`   ❌ Nenhum user com engagementScore encontrado`);
      if (totalUsers > 0) {
        report.recommendations.push('🚨 CRÍTICO: Implementar cálculo de engagementScore AGORA!');
      }
    }

    // ═══════════════════════════════════════════════════════
    // 5️⃣ RELATÓRIO FINAL E RECOMENDAÇÕES
    // ═══════════════════════════════════════════════════════
    
    console.log('\n' + '═'.repeat(60));
    console.log('📊 RELATÓRIO FINAL\n');
    
    const readyPercentage = totalUsers > 0 ? (
      (usersWithEngagement / totalUsers) * 0.4 +
      (totalUserProducts > 0 ? (upWithProgress / totalUserProducts) * 0.4 : 0) +
      (totalProducts > 0 ? 20 : 0)
    ) : 0;
    
    console.log(`🎯 PRONTIDÃO GERAL: ${readyPercentage.toFixed(1)}%\n`);
    
    if (readyPercentage < 70) {
      console.log('🚨 SISTEMA NÃO ESTÁ PRONTO PARA DASHBOARD V2');
      console.log('   Executar migrações e cálculos antes de prosseguir!\n');
    } else if (readyPercentage < 90) {
      console.log('⚠️ SISTEMA PARCIALMENTE PRONTO');
      console.log('   Algumas otimizações necessárias\n');
    } else {
      console.log('✅ SISTEMA PRONTO PARA DASHBOARD V2!\n');
    }
    
    console.log('📋 AÇÕES RECOMENDADAS:\n');
    if (report.recommendations.length === 0) {
      console.log('   ✅ Nenhuma ação necessária! Sistema OK.');
    } else {
      report.recommendations.forEach((rec: string, i: number) => {
        console.log(`   ${i + 1}. ${rec}`);
      });
    }
    
    // Salvar relatório
    const fs = require('fs');
    const filename = `diagnostic-report-${Date.now()}.json`;
    fs.writeFileSync(
      filename,
      JSON.stringify(report, null, 2)
    );
    
    console.log(`\n💾 Relatório completo salvo em: ${filename}`);
    console.log('═'.repeat(60) + '\n');
    
    return report;

  } catch (error: any) {
    console.error('❌ Erro no diagnóstico:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Executar
diagnosticDashboardV2()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });

