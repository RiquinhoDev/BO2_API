const axios = require('axios');

async function testEndpoint() {
  console.log('Testando endpoint /api/users/v2 com filtros...\n');

  // Test 1: Hotmart + Muito Alto
  console.log('Test 1: platform=hotmart & progressLevel=MUITO_ALTO');
  const start1 = Date.now();
  try {
    const res1 = await axios.get('http://localhost:3001/api/users/v2', {
      params: {
        platform: 'hotmart',
        progressLevel: 'MUITO_ALTO',
        page: 1,
        limit: 50
      },
      timeout: 30000
    });
    const duration1 = Date.now() - start1;
    console.log(`Resposta em ${duration1}ms`);
    console.log(`Total: ${res1.data.pagination?.total || 0} users`);
    console.log(`Retornados: ${res1.data.data?.length || 0} users\n`);
  } catch (err) {
    const duration1 = Date.now() - start1;
    console.log(`Erro apos ${duration1}ms:`, err.message, '\n');
  }

  // Test 2: Apenas Hotmart
  console.log('Test 2: platform=hotmart (sem filtro de progresso)');
  const start2 = Date.now();
  try {
    const res2 = await axios.get('http://localhost:3001/api/users/v2', {
      params: {
        platform: 'hotmart',
        page: 1,
        limit: 50
      },
      timeout: 30000
    });
    const duration2 = Date.now() - start2;
    console.log(`Resposta em ${duration2}ms`);
    console.log(`Total: ${res2.data.pagination?.total || 0} users`);
    console.log(`Retornados: ${res2.data.data?.length || 0} users\n`);
  } catch (err) {
    const duration2 = Date.now() - start2;
    console.log(`Erro apos ${duration2}ms:`, err.message, '\n');
  }

  // Test 3: Sem filtros
  console.log('Test 3: Sem filtros');
  const start3 = Date.now();
  try {
    const res3 = await axios.get('http://localhost:3001/api/users/v2', {
      params: {
        page: 1,
        limit: 50
      },
      timeout: 30000
    });
    const duration3 = Date.now() - start3;
    console.log(`Resposta em ${duration3}ms`);
    console.log(`Total: ${res3.data.pagination?.total || 0} users`);
    console.log(`Retornados: ${res3.data.data?.length || 0} users\n`);
  } catch (err) {
    const duration3 = Date.now() - start3;
    console.log(`Erro apos ${duration3}ms:`, err.message, '\n');
  }
}

testEndpoint().catch(console.error);
