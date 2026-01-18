// Teste: Executar sync CursEduca para grupo 6 e 7
const axios = require('axios');

const API_URL = 'http://localhost:54112/api';

async function testSync() {
  try {
    console.log('🚀 Iniciando sync CursEduca...\n');

    // Sync apenas grupos 6 e 7
    const response = await axios.post(`${API_URL}/curseduca/sync`, {}, {
      timeout: 300000 // 5 minutos
    });

    console.log('\n✅ RESULTADO DO SYNC:\n');
    console.log(JSON.stringify(response.data, null, 2));

    if (response.data.logFile) {
      console.log(`\n📁 Log completo: ${response.data.logFile}`);
    }

  } catch (error) {
    console.error('❌ Erro:', error.response?.data || error.message);
  }
}

testSync();
