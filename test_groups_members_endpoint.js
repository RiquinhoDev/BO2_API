// ════════════════════════════════════════════════════════════
// TESTE: Verificar endpoint /groups/{groupId}/members
// ════════════════════════════════════════════════════════════

const axios = require('axios');

const CURSEDUCA_API_URL = "https://prof.curseduca.pro";
const CURSEDUCA_API_KEY = "ce9ef2a4afef727919473d38acafe10109c4faa8";
const CURSEDUCA_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds";

const headers = {
  'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
  'api_key': CURSEDUCA_API_KEY,
  'Content-Type': 'application/json'
};

async function testGroupsEndpoint() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE: Endpoint /groups/{groupId}/members');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    console.log('📡 Testando: GET /groups/6/members (Clareza Mensal)');
    console.log('─────────────────────────────────────────────────────────\n');

    const response = await axios.get(`${CURSEDUCA_API_URL}/groups/6/members`, {
      headers,
      timeout: 30000
    });

    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Tipo de resposta: ${Array.isArray(response.data) ? 'Array' : typeof response.data}`);

    let members = [];

    if (Array.isArray(response.data)) {
      members = response.data;
    } else if (response.data?.data) {
      members = response.data.data;
    } else if (response.data?.members) {
      members = response.data.members;
    }

    console.log(`📦 Total members: ${members.length}\n`);

    if (members.length > 0) {
      console.log('📋 Exemplo de member (primeiro):');
      console.log(JSON.stringify(members[0], null, 2));
      console.log('\n');
    }

    // Procurar João
    const joao = members.find(m =>
      m.email === 'joaomcf37@gmail.com' ||
      m.id === 5
    );

    if (joao) {
      console.log('✅ ✅ ✅ JOÃO ENCONTRADO! ✅ ✅ ✅\n');
      console.log(JSON.stringify(joao, null, 2));
    } else {
      console.log('❌ ❌ ❌ JOÃO NÃO ENCONTRADO! ❌ ❌ ❌\n');
      console.log('⚠️  PROBLEMA: O endpoint /groups/6/members não retorna o João');
      console.log('💡 POSSIBILIDADES:');
      console.log('   1. Endpoint não retorna admins');
      console.log('   2. João não está realmente no grupo 6');
      console.log('   3. Endpoint tem paginação ou filtros');
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔍 Verificando grupo 7 também...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const response7 = await axios.get(`${CURSEDUCA_API_URL}/groups/7/members`, {
      headers,
      timeout: 30000
    });

    let members7 = [];

    if (Array.isArray(response7.data)) {
      members7 = response7.data;
    } else if (response7.data?.data) {
      members7 = response7.data.data;
    } else if (response7.data?.members) {
      members7 = response7.data.members;
    }

    console.log(`📦 Total members no grupo 7: ${members7.length}\n`);

    const joao7 = members7.find(m =>
      m.email === 'joaomcf37@gmail.com' ||
      m.id === 5
    );

    if (joao7) {
      console.log('✅ ✅ ✅ JOÃO ENCONTRADO NO GRUPO 7! ✅ ✅ ✅\n');
    } else {
      console.log('❌ João também NÃO está no grupo 7\n');
    }

  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGroupsEndpoint();
