const axios = require('axios');

const ACCESS_TOKEN = "***REMOVED-JWT***";
const API_KEY = "***REMOVED-CURSEDUCA-KEY***";

// Teste 1: Com Authorization Bearer
console.log('🔍 Teste 1: Authorization Bearer + x-api-key');
axios.get('https://clas.curseduca.pro/reports/progress', {
  headers: {
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
    'x-api-key': API_KEY,
    'Content-Type': 'application/json'
  },
  httpsAgent: new (require('https')).Agent({ rejectUnauthorized: false })
})
  .then(response => {
    console.log('✅ SUCESSO Teste 1:');
    console.log(JSON.stringify(response.data, null, 2));
  })
  .catch(err => {
    console.log('❌ ERRO Teste 1:', err.response?.data || err.message);

    // Teste 2: Só Authorization (sem Bearer)
    console.log('\n🔍 Teste 2: Authorization sem Bearer + x-api-key');
    return axios.get('https://clas.curseduca.pro/reports/progress', {
      headers: {
        'Authorization': ACCESS_TOKEN,
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      httpsAgent: new (require('https')).Agent({ rejectUnauthorized: false })
    });
  })
  .then(response => {
    if (response) {
      console.log('✅ SUCESSO Teste 2:');
      console.log(JSON.stringify(response.data, null, 2));
    }
  })
  .catch(err => {
    console.log('❌ ERRO Teste 2:', err.response?.data || err.message);

    // Teste 3: Só API Key
    console.log('\n🔍 Teste 3: Só x-api-key');
    return axios.get('https://clas.curseduca.pro/reports/progress', {
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      httpsAgent: new (require('https')).Agent({ rejectUnauthorized: false })
    });
  })
  .then(response => {
    if (response) {
      console.log('✅ SUCESSO Teste 3:');
      console.log(JSON.stringify(response.data, null, 2));
    }
  })
  .catch(err => {
    console.log('❌ ERRO Teste 3:', err.response?.data || err.message);
    console.log('\n🔴 Nenhum método funcionou. O endpoint requer autenticação específica.');
  });
