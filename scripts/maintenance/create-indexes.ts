import mongoose from 'mongoose';
import User from '../../src/models/User';
import UserProduct from '../../src/models/UserProduct';
import Product from '../../src/models/Product';
import Class from '../../src/models/Class';

async function createIndexes() {
  try {
    console.log('🔍 CRIAÇÃO DE INDEXES - MongoDB Performance\n');
    console.log('='.repeat(70));
    
    await mongoose.connect(process.env.MONGO_URI!);
    
    console.log('\n📊 Criando indexes para User...\n');
    
    // User indexes
    await User.collection.createIndex({ email: 1 }, { unique: true });
    console.log('✓ User.email (unique)');
    
    await User.collection.createIndex({ 'discord.userId': 1 });
    console.log('✓ User.discord.userId');
    
    await User.collection.createIndex({ 'hotmart.email': 1 });
    console.log('✓ User.hotmart.email');
    
    await User.collection.createIndex({ 'curseduca.email': 1 });
    console.log('✓ User.curseduca.email');
    
    await User.collection.createIndex({ 
      consolidatedCourses: 1, 
      allPlatforms: 1 
    });
    console.log('✓ User.consolidatedCourses + allPlatforms (compound)');
    
    await User.collection.createIndex({ lastActivityDate: 1 });
    console.log('✓ User.lastActivityDate');
    
    await User.collection.createIndex({ 
      'activeCampaign.lastEmailSent': 1,
      'activeCampaign.isActive': 1
    });
    console.log('✓ User.activeCampaign (compound)');
    
    // UserProduct indexes
    console.log('\n📊 Criando indexes para UserProduct...\n');
    
    await UserProduct.collection.createIndex({ 
      userId: 1, 
      productId: 1 
    }, { unique: true });
    console.log('✓ UserProduct.userId + productId (unique compound)');
    
    await UserProduct.collection.createIndex({ userId: 1 });
    console.log('✓ UserProduct.userId');
    
    await UserProduct.collection.createIndex({ productId: 1 });
    console.log('✓ UserProduct.productId');
    
    await UserProduct.collection.createIndex({ 
      'platformData.platformId': 1 
    });
    console.log('✓ UserProduct.platformData.platformId');
    
    await UserProduct.collection.createIndex({ lastActivityDate: 1 });
    console.log('✓ UserProduct.lastActivityDate');
    
    // Product indexes
    console.log('\n📊 Criando indexes para Product...\n');
    
    await Product.collection.createIndex({ code: 1 }, { unique: true });
    console.log('✓ Product.code (unique)');
    
    await Product.collection.createIndex({ platform: 1 });
    console.log('✓ Product.platform');
    
    await Product.collection.createIndex({ isActive: 1 });
    console.log('✓ Product.isActive');
    
    // Class indexes
    console.log('\n📊 Criando indexes para Class...\n');
    
    await Class.collection.createIndex({ productId: 1 });
    console.log('✓ Class.productId');
    
    await Class.collection.createIndex({ date: 1 });
    console.log('✓ Class.date');
    
    await Class.collection.createIndex({ 
      productId: 1, 
      date: -1 
    });
    console.log('✓ Class.productId + date (compound, desc)');
    
    // Listar todos os indexes criados
    console.log('\n' + '='.repeat(70));
    console.log('\n📋 INDEXES EXISTENTES:\n');
    
    const userIndexes = await User.collection.indexes();
    console.log('User:', userIndexes.length, 'indexes');
    userIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    const userProductIndexes = await UserProduct.collection.indexes();
    console.log('\nUserProduct:', userProductIndexes.length, 'indexes');
    userProductIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    const productIndexes = await Product.collection.indexes();
    console.log('\nProduct:', productIndexes.length, 'indexes');
    productIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    const classIndexes = await Class.collection.indexes();
    console.log('\nClass:', classIndexes.length, 'indexes');
    classIndexes.forEach(idx => {
      console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });
    
    console.log('\n' + '='.repeat(70));
    console.log('\n✅ Todos os indexes criados com sucesso!\n');
    
  } catch (error) {
    console.error('\n❌ ERRO ao criar indexes:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// Executar
createIndexes();

