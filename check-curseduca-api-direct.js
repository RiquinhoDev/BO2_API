// Verificar diretamente na API do CursEduca quantos alunos têm os grupos
const axios = require('axios');
require('dotenv').config();

const CURSEDUCA_API_URL = "https://prof.curseduca.pro";
const CURSEDUCA_API_KEY = "***REMOVED-CURSEDUCA-KEY***";
const CURSEDUCA_ACCESS_TOKEN = "***REMOVED-JWT***";

async function checkAPI() {
  try {
    const headers = {
      'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
      'api_key': CURSEDUCA_API_KEY,
      'Content-Type': 'application/json'
    };

    console.log('📡 VERIFICANDO API CURSEDUCA DIRETAMENTE\n');
    console.log('='.repeat(70));

    // 1. Buscar grupos
    console.log('\n1️⃣  Buscando grupos Clareza...\n');
    const groupsResponse = await axios.get(`${CURSEDUCA_API_URL}/groups`, {
      headers,
      timeout: 30000
    });

    const allGroups = Array.isArray(groupsResponse.data)
      ? groupsResponse.data
      : groupsResponse.data?.data || groupsResponse.data?.groups || [];

    const clarezaGroups = allGroups.filter(g =>
      g.name.toLowerCase().includes('clareza')
    );

    console.log(`   Total de grupos: ${allGroups.length}`);
    console.log(`   Grupos Clareza: ${clarezaGroups.length}\n`);

    for (const group of clarezaGroups) {
      console.log(`   📚 ${group.name}`);
      console.log(`      ID: ${group.id}`);
      console.log(`      UUID: ${group.uuid}`);
      console.log('');
    }

    // 2. Para cada grupo, buscar membros
    console.log('='.repeat(70));
    console.log('\n2️⃣  Contando membros de cada grupo:\n');

    for (const group of clarezaGroups) {
      console.log(`📊 ${group.name} (ID: ${group.id})\n`);

      // Via /groups/{id}/members
      try {
        const membersResponse = await axios.get(
          `${CURSEDUCA_API_URL}/groups/${group.id}/members`,
          {
            headers,
            params: { limit: 1000 },
            timeout: 30000
          }
        );

        const members = Array.isArray(membersResponse.data)
          ? membersResponse.data
          : membersResponse.data?.data || membersResponse.data?.members || [];

        console.log(`   Via /groups/${group.id}/members: ${members.length} members`);
      } catch (err) {
        console.log(`   ❌ Erro: ${err.message}`);
      }

      // Via /reports/group/members
      try {
        let allMembers = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;
        let pageCount = 0;
        const maxPages = 10;

        while (hasMore && offset < 1000 && pageCount < maxPages) {
          pageCount++;

          const response = await axios.get(
            `${CURSEDUCA_API_URL}/reports/group/members`,
            {
              headers,
              params: { groupId: group.id, offset, limit },
              timeout: 30000
            }
          );

          const data = response.data?.data || [];
          allMembers = allMembers.concat(data);

          hasMore = data.length === limit;
          offset += limit;

          if (!hasMore) break;
        }

        console.log(`   Via /reports/group/members: ${allMembers.length} members com progresso`);
      } catch (err) {
        console.log(`   ❌ Erro: ${err.message}`);
      }

      console.log('');
    }

    console.log('='.repeat(70));
    console.log('\n✅ Verificação completa!\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

checkAPI();
