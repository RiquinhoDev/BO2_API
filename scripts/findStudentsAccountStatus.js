// ════════════════════════════════════════════════════════════
// Script para encontrar alunos com diferentes ACCOUNT_STATUS
// ════════════════════════════════════════════════════════════

const mongoose = require('mongoose');
require('dotenv').config();

const UserProduct = require('../dist/models/UserProduct').default;
const User = require('../dist/models/user').default;
const Product = require('../dist/models/product/Product').default;

async function findStudentsAccountStatus() {
  try {
    console.log('🔌 Conectando à BD...\n');
    await mongoose.connect(process.env.MONGO_URI);

    console.log('═'.repeat(70));
    console.log('🔍 PROCURANDO ALUNOS POR ACCOUNT_STATUS');
    console.log('═'.repeat(70));

    // 1. CANCELLED
    console.log('\n1️⃣ STATUS: CANCELLED');
    console.log('─'.repeat(70));
    const cancelled = await UserProduct.find({ status: 'CANCELLED' })
      .populate('userId', 'email name')
      .populate('productId', 'name')
      .limit(3)
      .lean();

    if (cancelled.length > 0) {
      console.log(`✅ Encontrados ${cancelled.length} alunos:`);
      cancelled.forEach((up, i) => {
        console.log(`   ${i + 1}. ${up.userId?.email} - ${up.productId?.name}`);
      });
    } else {
      console.log('❌ Nenhum aluno encontrado com status CANCELLED');
    }

    // 2. SUSPENDED
    console.log('\n2️⃣ STATUS: SUSPENDED');
    console.log('─'.repeat(70));
    const suspended = await UserProduct.find({ status: 'SUSPENDED' })
      .populate('userId', 'email name')
      .populate('productId', 'name')
      .limit(3)
      .lean();

    if (suspended.length > 0) {
      console.log(`✅ Encontrados ${suspended.length} alunos:`);
      suspended.forEach((up, i) => {
        console.log(`   ${i + 1}. ${up.userId?.email} - ${up.productId?.name}`);
      });
    } else {
      console.log('❌ Nenhum aluno encontrado com status SUSPENDED');
    }

    // 3. EXPIRED
    console.log('\n3️⃣ STATUS: EXPIRED');
    console.log('─'.repeat(70));
    const expired = await UserProduct.find({ status: 'EXPIRED' })
      .populate('userId', 'email name')
      .populate('productId', 'name')
      .limit(3)
      .lean();

    if (expired.length > 0) {
      console.log(`✅ Encontrados ${expired.length} alunos:`);
      expired.forEach((up, i) => {
        console.log(`   ${i + 1}. ${up.userId?.email} - ${up.productId?.name}`);
      });
    } else {
      console.log('❌ Nenhum aluno encontrado com status EXPIRED');
    }

    // 4. REFUNDED
    console.log('\n4️⃣ REEMBOLSADO (metadata.refunded)');
    console.log('─'.repeat(70));
    const refunded = await UserProduct.find({ 'metadata.refunded': true })
      .populate('userId', 'email name')
      .populate('productId', 'name')
      .limit(3)
      .lean();

    if (refunded.length > 0) {
      console.log(`✅ Encontrados ${refunded.length} alunos:`);
      refunded.forEach((up, i) => {
        console.log(`   ${i + 1}. ${up.userId?.email} - ${up.productId?.name}`);
        console.log(`      Status: ${up.status}`);
        console.log(`      Refund Date: ${up.metadata?.refundDate || 'N/A'}`);
      });
    } else {
      console.log('❌ Nenhum aluno encontrado com refunded = true');
    }

    // 5. REACTIVATED (últimos 30 dias)
    console.log('\n5️⃣ REATIVADO (reactivatedAt nos últimos 30 dias)');
    console.log('─'.repeat(70));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const reactivated = await UserProduct.find({
      reactivatedAt: { $gte: thirtyDaysAgo }
    })
      .populate('userId', 'email name')
      .populate('productId', 'name')
      .limit(3)
      .lean();

    if (reactivated.length > 0) {
      console.log(`✅ Encontrados ${reactivated.length} alunos:`);
      reactivated.forEach((up, i) => {
        const daysAgo = Math.floor((Date.now() - new Date(up.reactivatedAt).getTime()) / (1000 * 60 * 60 * 24));
        console.log(`   ${i + 1}. ${up.userId?.email} - ${up.productId?.name}`);
        console.log(`      Reativado há: ${daysAgo} dias`);
      });
    } else {
      console.log('❌ Nenhum aluno reativado nos últimos 30 dias');
    }

    // 6. MANUALLY INACTIVATED
    console.log('\n6️⃣ INATIVADO MANUALMENTE');
    console.log('─'.repeat(70));
    const manuallyInactivated = await User.find({
      'inactivation.isManuallyInactivated': true
    })
      .select('email name inactivation')
      .limit(3)
      .lean();

    if (manuallyInactivated.length > 0) {
      console.log(`✅ Encontrados ${manuallyInactivated.length} utilizadores:`);
      manuallyInactivated.forEach((user, i) => {
        console.log(`   ${i + 1}. ${user.email}`);
        console.log(`      Inativado em: ${user.inactivation?.inactivatedAt || 'N/A'}`);
        console.log(`      Razão: ${user.inactivation?.reason || 'N/A'}`);
      });
    } else {
      console.log('❌ Nenhum utilizador inativado manualmente');
    }

    // 7. CURSEDUCA INACTIVE
    console.log('\n7️⃣ CURSEDUCA INATIVO (curseduca.memberStatus)');
    console.log('─'.repeat(70));
    const curseducaInactive = await UserProduct.find({
      'curseduca.memberStatus': 'INACTIVE'
    })
      .populate('userId', 'email name')
      .populate('productId', 'name')
      .limit(3)
      .lean();

    if (curseducaInactive.length > 0) {
      console.log(`✅ Encontrados ${curseducaInactive.length} alunos:`);
      curseducaInactive.forEach((up, i) => {
        console.log(`   ${i + 1}. ${up.userId?.email} - ${up.productId?.name}`);
        console.log(`      Member Status: ${up.curseduca?.memberStatus}`);
        console.log(`      Status UserProduct: ${up.status}`);
      });
    } else {
      console.log('❌ Nenhum aluno com curseduca.memberStatus = INACTIVE');
    }

    // 8. RESUMO - Emails para testar
    console.log('\n═'.repeat(70));
    console.log('📋 EMAILS PARA ADICIONAR AO TESTE:');
    console.log('═'.repeat(70));

    const allEmails = new Set();

    if (cancelled.length > 0) {
      console.log('\n✅ CANCELLED:');
      cancelled.forEach(up => {
        const email = up.userId?.email;
        if (email) {
          allEmails.add(email);
          console.log(`   ${email}`);
        }
      });
    }

    if (refunded.length > 0) {
      console.log('\n✅ REFUNDED:');
      refunded.forEach(up => {
        const email = up.userId?.email;
        if (email) {
          allEmails.add(email);
          console.log(`   ${email}`);
        }
      });
    }

    if (reactivated.length > 0) {
      console.log('\n✅ REACTIVATED:');
      reactivated.forEach(up => {
        const email = up.userId?.email;
        if (email) {
          allEmails.add(email);
          console.log(`   ${email}`);
        }
      });
    }

    if (suspended.length > 0) {
      console.log('\n✅ SUSPENDED:');
      suspended.forEach(up => {
        const email = up.userId?.email;
        if (email) {
          allEmails.add(email);
          console.log(`   ${email}`);
        }
      });
    }

    console.log(`\n📊 Total de emails únicos: ${allEmails.size}`);

    await mongoose.disconnect();

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

findStudentsAccountStatus();
