// ════════════════════════════════════════════════════════════
// TESTE: Verificar paginação de /groups/{groupId}/members
// ════════════════════════════════════════════════════════════

const axios = require('axios');

const CURSEDUCA_API_URL = "https://prof.curseduca.pro";
const CURSEDUCA_API_KEY = "***REMOVED-CURSEDUCA-KEY***";
const CURSEDUCA_ACCESS_TOKEN = "***REMOVED-JWT***";

const headers = {
  'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
  'api_key': CURSEDUCA_API_KEY,
  'Content-Type': 'application/json'
};

async function testPagination() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE: Paginação de /groups/{groupId}/members');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Testar com diferentes parâmetros
    const tests = [
      { params: {}, desc: 'Sem parâmetros' },
      { params: { limit: 1000 }, desc: 'Limit 1000' },
      { params: { page: 1, limit: 1000 }, desc: 'Page 1, Limit 1000' },
      { params: { offset: 0, limit: 1000 }, desc: 'Offset 0, Limit 1000' },
    ];

    for (const test of tests) {
      console.log(`📡 Testando: ${test.desc}`);
      console.log(`   Params:`, JSON.stringify(test.params));

      const response = await axios.get(`${CURSEDUCA_API_URL}/groups/6/members`, {
        headers,
        params: test.params,
        timeout: 30000
      });

      let members = [];
      if (Array.isArray(response.data)) {
        members = response.data;
      } else if (response.data?.data) {
        members = response.data.data;
      } else if (response.data?.members) {
        members = response.data.members;
      }

      console.log(`   ✅ Retornou: ${members.length} members`);

      // Verificar se João está na lista
      const joao = members.find(m => m.email === 'joaomcf37@gmail.com' || m.id === 5);
      if (joao) {
        console.log(`   🎉 JOÃO ENCONTRADO!`);
        console.log(`      ID: ${joao.id}`);
        console.log(`      Nome: ${joao.name}`);
      } else {
        console.log(`   ❌ João NÃO encontrado nesta resposta`);
      }

      console.log('');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPagination();
