// Script para executar sync do Hotmart manualmente
const mongoose = require('mongoose');

// Conectar ao MongoDB
const MONGO_URI = 'mongodb://localhost:27017/osriquinhos';

async function runHotmartSync() {
  try {
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado!');

    // Importar o scheduler
    const syncSchedulerService = require('./dist/services/cron/scheduler').default;

    // ID do job "1º" (Hotmart)
    const jobId = new mongoose.Types.ObjectId('694db33f0f6156eb9d90da70');
    const triggeredBy = new mongoose.Types.ObjectId('000000000000000000000000'); // Sistema

    console.log('🚀 Executando sync do Hotmart...');
    const result = await syncSchedulerService.executeJobManually(jobId, triggeredBy);

    console.log('✅ Sync completo!');
    console.log('📊 Resultado:', JSON.stringify(result, null, 2));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runHotmartSync();
