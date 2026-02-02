const axios = require('axios');

const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds";
const API_KEY = "ce9ef2a4afef727919473d38acafe10109c4faa8";

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
