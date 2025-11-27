// BO2_API/scripts/create-discord-product.ts
// 🎯 Script para criar produto Discord na BD
// Data: 27 Novembro 2025

import mongoose from 'mongoose';
import Product from '../src/models/Product';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

async function createDiscordProduct() {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/riquinho';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado ao MongoDB\n');

    // Verificar se já existe
    const existing = await Product.findOne({ platform: 'discord' });
    
    if (existing) {
      console.log('⚠️  Produto Discord já existe!');
      console.log(`   ID: ${existing._id}`);
      console.log(`   Nome: ${existing.name}`);
      console.log(`   Code: ${existing.code}`);
      console.log(`   Platform: ${existing.platform}\n`);
      await mongoose.disconnect();
      return;
    }

    // Buscar um Course existente ou criar um genérico
    const Course = (await import('../src/models/Course')).default;
    let discordCourse = await Course.findOne({ code: 'OUTRO' });
    
    if (!discordCourse) {
      console.log('   📚 Criando Course genérico (OUTRO) para Discord...');
      discordCourse = await Course.create({
        name: 'Outros Produtos',
        code: 'OUTRO',
        trackingType: 'LOGIN_BASED',
        trackingConfig: {
          loginThresholds: { warning: 7, critical: 14 }
        },
        activeCampaignConfig: {
          tagPrefix: 'OUTRO',
          listId: '0'  // Dummy listId
        },
        isActive: true
      });
      console.log(`   ✅ Course criado: ${discordCourse._id}\n`);
    } else {
      console.log(`   ✅ Course OUTRO já existe: ${discordCourse._id}\n`);
    }

    // Criar novo produto Discord
    const discordProduct = await Product.create({
      name: 'Comunidade Discord',
      code: 'DISCORD_COMMUNITY',
      courseId: discordCourse._id,  // ← OBRIGATÓRIO
      platform: 'discord',
      isActive: true,
      description: 'Acesso à comunidade Discord do Riquinho'
    });

    console.log('✅ Produto Discord criado com sucesso!\n');
    console.log(`   ID: ${discordProduct._id}`);
    console.log(`   Nome: ${discordProduct.name}`);
    console.log(`   Code: ${discordProduct.code}`);
    console.log(`   Platform: ${discordProduct.platform}`);
    console.log(`   Type: ${discordProduct.type}`);
    console.log(`   Status: ${discordProduct.status}\n`);

    await mongoose.disconnect();
    console.log('✅ Desconectado do MongoDB\n');

  } catch (error) {
    console.error('❌ Erro:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createDiscordProduct();

