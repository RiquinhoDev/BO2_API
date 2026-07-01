const axios = require('axios');
const https = require('https');

const ACCESS_TOKEN = process.env.CURSEDUCA_ACCESS_TOKEN;
const API_KEY = process.env.CURSEDUCA_API_KEY;

const TARGET_EMAIL = "joaomcf37@gmail.com";
const TARGET_MEMBER_ID = 5;

async function fetchAllProgress() {
  console.log('🔍 Buscando progresso do utilizador...\n');

  let allData = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore && offset < 5000) {
    try {
      const response = await axios.get(
        'https://clas.curseduca.pro/reports/progress',
        {
          params: { limit, offset },
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'api_key': API_KEY,
            'Content-Type': 'application/json'
          },
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 30000
        }
      );

      const { data, metadata } = response.data;
      allData = allData.concat(data);

      console.log(`   📄 Página offset=${offset}: ${data.length} registos (total: ${metadata.totalCount})`);

      hasMore = metadata.hasMore;
      offset += limit;

      // Se encontrarmos o user, podemos parar early
      const userRecords = data.filter(r =>
        r.member.email.toLowerCase() === TARGET_EMAIL.toLowerCase() ||
        r.member.id === TARGET_MEMBER_ID
      );

      if (userRecords.length > 0) {
        console.log(`   ✅ Encontrados ${userRecords.length} registos do utilizador nesta página!`);
      }

    } catch (err) {
      console.error(`❌ Erro na página offset=${offset}:`, err.message);
      break;
    }
  }

  console.log(`\n📊 Total de registos obtidos: ${allData.length}`);

  // Filtrar pelo user
  const userProgress = allData.filter(r =>
    r.member.email.toLowerCase() === TARGET_EMAIL.toLowerCase() ||
    r.member.id === TARGET_MEMBER_ID
  );

  console.log(`\n✅ PROGRESSO DE ${TARGET_EMAIL}:\n`);

  if (userProgress.length === 0) {
    console.log('❌ Nenhum registo de progresso encontrado para este utilizador.');
    console.log('\n📋 Dados do utilizador na BD:');
    console.log('   Email: joaomcf37@gmail.com');
    console.log('   CursEduca User ID: 5');
    console.log('   CursEduca UUID: 9c912314-689c-11f0-a1f1-0afffde6869d');
    console.log('   Grupo: Clareza - Anual (ID: 7)');
    console.log('   LastLogin: 2026-01-25T07:59:04.000Z');
  } else {
    console.log(`   Total de lições completadas: ${userProgress.length}`);
    console.log('');

    // Agrupar por conteúdo
    const byContent = {};
    userProgress.forEach(r => {
      const contentName = r.lesson?.section?.content?.title || 'UNKNOWN';
      if (!byContent[contentName]) byContent[contentName] = [];
      byContent[contentName].push(r);
    });

    Object.entries(byContent).forEach(([contentName, lessons]) => {
      console.log(`   📚 ${contentName}: ${lessons.length} lições`);

      // Mostrar algumas lições
      lessons.slice(0, 3).forEach(l => {
        console.log(`      - ${l.lesson.title} (${new Date(l.finishedAt).toLocaleDateString('pt-PT')})`);
      });

      if (lessons.length > 3) {
        console.log(`      ... e mais ${lessons.length - 3} lições`);
      }
    });

    // Progress geral
    if (userProgress.length > 0 && userProgress[0].enrollment?.progress) {
      console.log(`\n   📊 Progresso no curso: ${userProgress[0].enrollment.progress}%`);
    }
  }
}

fetchAllProgress().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
