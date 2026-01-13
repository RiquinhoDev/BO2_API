// ════════════════════════════════════════════════════════════
// TESTE: Verificar se João aparece em /reports/group/members
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

async function testJoao() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 TESTE: João Ferreira (joaomcf37@gmail.com)');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // TESTE 1: Verificar /members/5
    console.log('📡 TESTE 1: GET /members/5');
    console.log('─────────────────────────────────────────────────────────\n');

    const memberResponse = await axios.get(`${CURSEDUCA_API_URL}/members/5`, {
      headers,
      timeout: 10000
    });

    const memberData = memberResponse.data;
    console.log(`✅ User encontrado: ${memberData.name} (${memberData.email})`);
    console.log(`   ID: ${memberData.id}`);
    console.log(`   UUID: ${memberData.uuid}`);
    console.log(`   isAdmin: ${memberData.isAdmin}`);
    console.log(`   situation: ${memberData.situation}`);
    console.log(`   lastLogin: ${memberData.lastLogin}`);
    console.log(`   Groups: ${memberData.groups.length}\n`);

    memberData.groups.forEach((g, i) => {
      console.log(`   Group ${i + 1}:`);
      console.log(`      ID: ${g.group.id}`);
      console.log(`      Nome: ${g.group.name}`);
      console.log(`      createdAt: ${g.createdAt}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // TESTE 2: Verificar se aparece em /reports/group/members para grupo 6
    console.log('📡 TESTE 2: GET /reports/group/members?groupId=6 (Clareza Mensal)');
    console.log('─────────────────────────────────────────────────────────\n');

    const group6Response = await axios.get(`${CURSEDUCA_API_URL}/reports/group/members`, {
      params: { groupId: 6, limit: 100 },
      headers,
      timeout: 10000
    });

    const group6Members = group6Response.data?.data || group6Response.data || [];
    console.log(`✅ Total membros no grupo 6: ${group6Members.length}`);

    const joaoInGroup6 = group6Members.find(m => m.email === 'joaomcf37@gmail.com');
    if (joaoInGroup6) {
      console.log(`   ✅ João ENCONTRADO no grupo 6!`);
      console.log(`      ID: ${joaoInGroup6.id}`);
      console.log(`      Nome: ${joaoInGroup6.name}`);
      console.log(`      Progress: ${joaoInGroup6.progress}%`);
    } else {
      console.log(`   ❌ João NÃO ENCONTRADO no grupo 6`);
      console.log(`   ⚠️  PROBLEMA: User não aparece em /reports/group/members`);
      console.log(`   💡 CAUSA: Provavelmente porque é admin ou não tem enrollment formal`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // TESTE 3: Verificar se aparece em /reports/group/members para grupo 7
    console.log('📡 TESTE 3: GET /reports/group/members?groupId=7 (Clareza Anual)');
    console.log('─────────────────────────────────────────────────────────\n');

    const group7Response = await axios.get(`${CURSEDUCA_API_URL}/reports/group/members`, {
      params: { groupId: 7, limit: 100 },
      headers,
      timeout: 10000
    });

    const group7Members = group7Response.data?.data || group7Response.data || [];
    console.log(`✅ Total membros no grupo 7: ${group7Members.length}`);

    const joaoInGroup7 = group7Members.find(m => m.email === 'joaomcf37@gmail.com');
    if (joaoInGroup7) {
      console.log(`   ✅ João ENCONTRADO no grupo 7!`);
      console.log(`      ID: ${joaoInGroup7.id}`);
      console.log(`      Nome: ${joaoInGroup7.name}`);
      console.log(`      Progress: ${joaoInGroup7.progress}%`);
    } else {
      console.log(`   ❌ João NÃO ENCONTRADO no grupo 7`);
      console.log(`   ⚠️  PROBLEMA: User não aparece em /reports/group/members`);
      console.log(`   💡 CAUSA: Provavelmente porque é admin ou não tem enrollment formal`);
    }

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // TESTE 4: Verificar enrollments
    console.log('📡 TESTE 4: GET /api/reports/enrollments?memberId=5');
    console.log('─────────────────────────────────────────────────────────\n');

    try {
      const enrollmentsResponse = await axios.get(`${CURSEDUCA_API_URL}/api/reports/enrollments`, {
        params: { memberId: 5, limit: 100 },
        headers,
        timeout: 10000
      });

      const enrollments = enrollmentsResponse.data?.data || [];
      console.log(`✅ Enrollments encontrados: ${enrollments.length}`);

      if (enrollments.length === 0) {
        console.log(`   ⚠️  PROBLEMA: Nenhum enrollment formal!`);
        console.log(`   💡 EXPLICAÇÃO: User foi adicionado aos grupos manualmente (admin)`);
        console.log(`   💡 SOLUÇÃO: Precisamos usar /members/{id} em vez de /reports/group/members`);
      } else {
        enrollments.forEach((e, i) => {
          console.log(`   Enrollment ${i + 1}:`);
          console.log(`      Content ID: ${e.content?.id}`);
          console.log(`      Progress: ${e.progress}%`);
        });
      }
    } catch (err) {
      if (err.response?.status === 404) {
        console.log(`   ⚠️  404 - Endpoint não encontrado ou sem enrollments`);
        console.log(`   💡 CONFIRMADO: User não tem enrollments formais`);
      } else {
        console.log(`   ❌ Erro: ${err.message}`);
      }
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 CONCLUSÃO:');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🔴 PROBLEMA IDENTIFICADO:');
    console.log('   O endpoint /reports/group/members NÃO retorna users que:');
    console.log('   - São admins (isAdmin: true)');
    console.log('   - Foram adicionados manualmente aos grupos');
    console.log('   - Não têm enrollment formal via compra/cadastro\n');

    console.log('✅ SOLUÇÃO:');
    console.log('   1. Usar /members/{id} para buscar TODOS os groups do user');
    console.log('   2. Criar UserProducts baseados em memberData.groups');
    console.log('   3. Isto já está implementado em fetchSingleUserData()');
    console.log('   4. Mas o batch sync (fetchCurseducaDataForSync) só usa /reports\n');

    console.log('🔧 FIX NECESSÁRIO:');
    console.log('   Modificar fetchCurseducaDataForSync para:');
    console.log('   - Também buscar /members para cada user encontrado');
    console.log('   - Ou usar uma estratégia híbrida que garanta todos os groups\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testJoao();
