// scripts/migrate-products.ts
import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Product from '../src/models/Product';

async function migrateProducts() {
  console.log('🔄 MIGRAÇÃO DE PRODUTOS\n');

  try {
    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
      throw new Error('MONGO_URI não configurado!');
    }

    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    // Criar ObjectIds fixos para courseIds (temporário até criar modelo Course)
    const clarezaCourseId = new mongoose.Types.ObjectId('673d0e5f0000000000000001');
    const ogiCourseId = new mongoose.Types.ObjectId('673d0e5f0000000000000002');

    // Produtos conhecidos
    const products = [
      {
        code: 'CLAREZA',
        name: 'Clareza - Mensal',
        platform: 'curseduca',
        courseId: clarezaCourseId,
        curseducaGroupId: '6',
        curseducaGroupUuid: 'e0e74523-a8f7-41dd-9813-a557ee51d46b',
        isActive: true,
        description: 'Clareza - Mensal (CursEduca)'
      },
      {
        code: 'CLAREZA',
        name: 'Clareza - Anual',
        platform: 'curseduca',
        courseId: clarezaCourseId,
        curseducaGroupId: '7',
        curseducaGroupUuid: '7b1232b0-d03f-499e-8f49-b7750bb75c52',
        isActive: true,
        description: 'Clareza - Anual (CursEduca)'
      },
      {
        code: 'CLAREZA',
        name: 'Clareza',
        platform: 'hotmart',
        courseId: clarezaCourseId,
        hotmartProductId: 'CLAREZA',
        isActive: true,
        description: 'Clareza (Hotmart)'
      },
      {
        code: 'OGI_V1',
        name: 'OGI V1',
        platform: 'hotmart',
        courseId: ogiCourseId,
        hotmartProductId: 'OGI_V1',
        isActive: true,
        description: 'OGI Versão 1 (Hotmart)'
      }
    ];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const productData of products) {
      try {
        const existing = await Product.findOne({
          code: productData.code,
          platform: productData.platform,
          name: productData.name
        });

        if (existing) {
          console.log(`⏭️  Produto já existe: ${productData.name} (${productData.platform})`);
          skipped++;
          continue;
        }

        const product = await Product.create(productData);
        console.log(`✅ Produto criado: ${product.name} (${product.platform}) - ID: ${product._id}`);
        created++;
      } catch (error: any) {
        console.error(`❌ Erro ao criar produto ${productData.name}:`, error.message);
        errors++;
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('═'.repeat(60));
    console.log(`✅ Produtos criados: ${created}`);
    console.log(`⏭️  Produtos ignorados: ${skipped}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📦 Total de produtos no sistema: ${await Product.countDocuments()}`);
    console.log('═'.repeat(60) + '\n');

    // Listar produtos criados
    if (created > 0 || skipped > 0) {
      console.log('📋 PRODUTOS NO SISTEMA:\n');
      const allProducts = await Product.find().select('name code platform isActive');
      allProducts.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.name} (${p.code}) - ${p.platform} - ${p.isActive ? '✅' : '❌'}`);
      });
      console.log('');
    }

  } catch (error: any) {
    console.error('❌ Erro na migração:', error.message);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

migrateProducts()
  .then(() => {
    console.log('✅ Migração concluída com sucesso!');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erro fatal:', err);
    process.exit(1);
  });
