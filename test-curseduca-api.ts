// SCRIPT DE TESTE RÁPIDO - CURSEDUCA
// Executar: npx ts-node test-curseduca-api.ts

import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const CURSEDUCA_API_URL = process.env.CURSEDUCA_API_URL;
const CURSEDUCA_ACCESS_TOKEN = process.env.CURSEDUCA_AccessToken;
const CURSEDUCA_API_KEY = process.env.CURSEDUCA_API_KEY;

async function testAPI() {
  console.log('🧪 TESTE DA API CURSEDUCA\n');
  console.log('='.repeat(80));
  
  console.log('📋 Configuração:');
  console.log(`   URL: ${CURSEDUCA_API_URL}`);
  console.log(`   API Key: ${CURSEDUCA_API_KEY ? '✅ Configurada' : '❌ Falta'}`);
  console.log(`   Token: ${CURSEDUCA_ACCESS_TOKEN ? '✅ Configurado' : '❌ Falta'}`);
  console.log('='.repeat(80));
  
  if (!CURSEDUCA_API_URL || !CURSEDUCA_API_KEY || !CURSEDUCA_ACCESS_TOKEN) {
    console.error('\n❌ Credenciais em falta no .env!');
    console.error('\nVerificar no .env:');
    console.error('  CURSEDUCA_API_URL=https://prof.curseduca.pro');
    console.error('  CURSEDUCA_API_KEY=...');
    console.error('  CURSEDUCA_AccessToken=...');
    return;
  }
  
  const headers = {
    'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
    'api_key': CURSEDUCA_API_KEY,
    'Content-Type': 'application/json'
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 1: Buscar grupos
  // ═══════════════════════════════════════════════════════════════════════
  console.log('\n🔍 TESTE 1: GET /groups');
  console.log('-'.repeat(80));
  
  try {
    const response = await axios.get(`${CURSEDUCA_API_URL}/groups`, { headers });
    console.log(`✅ Status: ${response.status}`);
    console.log(`📦 Tipo da resposta: ${Array.isArray(response.data) ? 'Array direto' : 'Objeto'}`);
    
    if (!Array.isArray(response.data)) {
      console.log(`📦 Keys do objeto: ${Object.keys(response.data).join(', ')}`);
    }
    
    const groups = Array.isArray(response.data) ? response.data : response.data?.data || [];
    console.log(`📚 Grupos encontrados: ${groups.length}`);
    
    if (groups.length > 0) {
      console.log('\n📄 Primeiros 3 grupos:');
      groups.slice(0, 3).forEach((g: any) => {
        console.log(`   - ID: ${g.id}, Nome: ${g.name}, UUID: ${g.uuid || 'N/A'}`);
      });
      
      // ═══════════════════════════════════════════════════════════════════════
      // TESTE 2: Buscar membros do primeiro grupo
      // ═══════════════════════════════════════════════════════════════════════
      const firstGroup = groups[0];
      console.log('\n' + '='.repeat(80));
      console.log(`🔍 TESTE 2: GET /reports/group/members?groupId=${firstGroup.id}`);
      console.log(`📚 Grupo: ${firstGroup.name} (ID: ${firstGroup.id})`);
      console.log('-'.repeat(80));
      
      try {
        const membersResponse = await axios.get(
          `${CURSEDUCA_API_URL}/reports/group/members`,
          { 
            params: { groupId: firstGroup.id },
            headers 
          }
        );
        
        console.log(`✅ Status: ${membersResponse.status}`);
        console.log(`📦 Tipo da resposta: ${Array.isArray(membersResponse.data) ? 'Array direto' : 'Objeto'}`);
        
        if (!Array.isArray(membersResponse.data)) {
          console.log(`📦 Keys do objeto: ${Object.keys(membersResponse.data).join(', ')}`);
        }
        
        const members = Array.isArray(membersResponse.data) 
          ? membersResponse.data 
          : membersResponse.data?.data || [];
        
        console.log(`👥 Membros encontrados: ${members.length}`);
        
        if (members.length > 0) {
          console.log('\n📄 Primeiro membro (estrutura):');
          const firstMember = members[0];
          console.log('   Keys disponíveis:', Object.keys(firstMember).join(', '));
          console.log('\n📄 Dados completos do primeiro membro:');
          console.log(JSON.stringify(firstMember, null, 2));
        } else {
          console.log('⚠️  Nenhum membro neste grupo');
        }
        
      } catch (error: any) {
        console.error(`❌ Erro ao buscar membros: ${error.message}`);
        if (error.response) {
          console.error(`   Status HTTP: ${error.response.status}`);
          console.error(`   Resposta:`, error.response.data);
        }
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // TESTE 3: Testar endpoint alternativo
      // ═══════════════════════════════════════════════════════════════════════
      console.log('\n' + '='.repeat(80));
      console.log(`🔍 TESTE 3: GET /groups/${firstGroup.id}/members (endpoint alternativo)`);
      console.log('-'.repeat(80));
      
      try {
        const altMembersResponse = await axios.get(
          `${CURSEDUCA_API_URL}/groups/${firstGroup.id}/members`,
          { headers }
        );
        
        console.log(`✅ Status: ${altMembersResponse.status}`);
        
        const altMembers = Array.isArray(altMembersResponse.data) 
          ? altMembersResponse.data 
          : altMembersResponse.data?.data || [];
        
        console.log(`👥 Membros encontrados: ${altMembers.length}`);
        
        if (altMembers.length > 0) {
          console.log('\n📄 Primeiro membro:');
          console.log(JSON.stringify(altMembers[0], null, 2));
        }
        
      } catch (error: any) {
        console.log(`⚠️  Endpoint alternativo não disponível ou não funciona`);
        console.log(`   Mensagem: ${error.message}`);
      }
      
    } else {
      console.log('⚠️  Nenhum grupo encontrado');
    }
    
  } catch (error: any) {
    console.error(`❌ Erro ao buscar grupos: ${error.message}`);
    if (error.response) {
      console.error(`   Status HTTP: ${error.response.status}`);
      console.error(`   Resposta:`, error.response.data);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Testes concluídos!');
  console.log('='.repeat(80));
}

testAPI().catch((error) => {
  console.error('\n' + '='.repeat(80));
  console.error('❌ ERRO FATAL NO SCRIPT DE TESTE');
  console.error('='.repeat(80));
  console.error(error);
  console.error('='.repeat(80));
});

