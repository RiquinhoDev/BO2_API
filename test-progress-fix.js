const axios = require('axios');
const https = require('https');

const ACCESS_TOKEN = "***REMOVED-JWT***";
const API_KEY = "***REMOVED-CURSEDUCA-KEY***";

// Simular a função helper
function getContentSlugFromGroup(groupName) {
  const normalized = groupName.toLowerCase().trim();

  if (normalized.includes('clareza')) {
    return 'clareza';
  }
  if (normalized.includes('ogi') || normalized.includes('o grande investimento')) {
    return 'ogi';
  }

  return null;
}

// Simular fetchProgressReport
async function testFetchProgressReport(groupId, groupName) {
  const progressMap = new Map();
  let offset = 0;
  const limit = 100;
  let hasMore = true;
  let pageCount = 0;
  const maxPages = 3; // Limitar para teste

  const contentSlug = getContentSlugFromGroup(groupName);
  if (!contentSlug) {
    console.log(`   ⚠️  Não consegui mapear grupo "${groupName}" para content`);
    return progressMap;
  }

  console.log(`\n📊 Testando grupo: ${groupName} (ID: ${groupId})`);
  console.log(`   Content slug: ${contentSlug}\n`);

  while (hasMore && offset < 300 && pageCount < maxPages) {
    pageCount++;

    try {
      const response = await axios.get(
        'https://clas.curseduca.pro/reports/progress',
        {
          params: { content: contentSlug, limit, offset },
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'api_key': API_KEY,
            'Content-Type': 'application/json'
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 30000
        }
      );

      const data = response.data || {};
      const items = Array.isArray(data.data) ? data.data : [];

      console.log(`   📄 Página ${pageCount}: ${items.length} registos`);

      for (const item of items) {
        const memberId = item.member?.id;
        if (!memberId) continue;

        const progressValue = parseInt(item.enrollment?.progress, 10) || 0;
        const lastActivity = item.finishedAt;

        const existing = progressMap.get(memberId);
        if (!existing || progressValue > existing.progress) {
          progressMap.set(memberId, {
            progress: progressValue,
            lastActivity: lastActivity || existing?.lastActivity,
            memberName: item.member?.name || 'Unknown',
            memberEmail: item.member?.email || 'Unknown'
          });
        }
      }

      const metadata = data.metadata || {};
      hasMore = metadata.hasMore || false;
      offset += limit;

      if (hasMore && pageCount < maxPages) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`   ❌ Erro na página ${pageCount}:`, error.message);
      break;
    }
  }

  console.log(`\n✅ Progresso carregado: ${progressMap.size} membros com progresso`);

  // Mostrar alguns exemplos
  if (progressMap.size > 0) {
    console.log('\n📝 Primeiros 5 membros:');
    let count = 0;
    for (const [memberId, data] of progressMap.entries()) {
      if (count >= 5) break;
      console.log(`   ${data.memberName} (${data.memberEmail}): ${data.progress}%`);
      count++;
    }
  }

  return progressMap;
}

// Testar com Clareza
async function runTests() {
  console.log('🧪 TESTE DE CORREÇÃO DO ENDPOINT /reports/progress\n');
  console.log('═'.repeat(60));

  await testFetchProgressReport(7, 'Clareza - Anual');

  console.log('\n' + '═'.repeat(60));
  console.log('\n✅ Teste concluído!');
}

runTests().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
