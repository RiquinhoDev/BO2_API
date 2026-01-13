"use strict";
// ════════════════════════════════════════════════════════════
// 📁 scripts/diagnose-classes-sync.ts
// DIAGNÓSTICO DE SINCRONIZAÇÃO DE TURMAS
// ════════════════════════════════════════════════════════════
//
// Este script:
// 1. Busca TODAS as turmas da API Hotmart
// 2. Busca TODOS os grupos do CursEduca
// 3. Compara com o que está na BD local
// 4. Identifica turmas em falta
// 5. Gera relatório detalhado
//
// Execução: npx ts-node scripts/diagnose-classes-sync.ts
//
// ════════════════════════════════════════════════════════════
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const axios_1 = __importDefault(require("axios"));
const mongoose_1 = __importDefault(require("mongoose"));
require("../src/models");
const Class_1 = require("../src/models/Class");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// ═══════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════
const HOTMART_CLIENT_ID = "4a933488-59ea-4aae-a266-b68c35f7d5f3";
const HOTMART_CLIENT_SECRET = "7447f4ef-cb9d-43c2-8009-46aee590760e";
const HOTMART_SUBDOMAIN = process.env.subdomain || 'ograndeinvestimento-bomrmk';
const HOTMART_Basic = "Basic NGE5MzM0ODgtNTllYS00YWFlLWEyNjYtYjY4YzM1ZjdkNWYzOjc0NDdmNGVmLWNiOWQtNDNjMi04MDA5LTQ2YWVlNTkwNzYwZQ==";
const CURSEDUCA_API_URL = "https://prof.curseduca.pro";
const CURSEDUCA_API_KEY = "ce9ef2a4afef727919473d38acafe10109c4faa8";
const CURSEDUCA_ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjp7ImlkIjozLCJ1dWlkIjoiYmZiNmExNjQtNmE5MC00MGFhLTg3OWYtYzEwNGIyZTZiNWVmIiwibmFtZSI6IlBlZHJvIE1pZ3VlbCBQZXJlaXJhIFNpbcO1ZXMgU2FudG9zIiwiZW1haWwiOiJjb250YWN0b3NAc2VycmlxdWluaG8uY29tIiwiaW1hZ2UiOiIvYXBwbGljYXRpb24vaW1hZ2VzL3VwbG9hZHMvMy8iLCJyb2xlcyI6WyJBRE1JTiJdLCJ0ZW5hbnRzIjpbXX0sImlhdCI6MTc1ODE5MDgwMH0.vI_Y9l7oZVIV4OT9XG7LWDIma-E7fcRkVYM7FOCxTds";
const MONGODB_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";
// Turmas que sabemos que devem existir (da tua lista)
const EXPECTED_CLASSES = [
    { name: 'Turma 17 | 2603', classId: '3V4Vj0nn42' },
    { name: 'Turma 8 [2a renov] + REITs | 2601', classId: 'gmeL6a6AOn' },
    { name: 'Turma 16 | 2511', classId: 'x3ea1qr8eg' },
    { name: 'Turma 12 [renov] + Divid + REITs | 2511', classId: 'v94Jy0bbOg' },
    { name: 'Turma 3 [3a renov] + REITs | 2511', classId: 'r37dEZ9KOL' },
    { name: 'Turmas 1 a 9 [renov] + REITs | 2507', classId: '0r48P1pn4R' },
    { name: 'Turma 15 + [2 anos] | 2509', classId: 'qV7yWAB14J' },
    { name: 'Turma 13 [renov] | 2602', classId: 'Pk45JL3qel' }
];
// ═══════════════════════════════════════════════════════════
// HOTMART: AUTENTICAÇÃO
// ═══════════════════════════════════════════════════════════
async function getHotmartAccessToken() {
    if (!HOTMART_CLIENT_ID || !HOTMART_CLIENT_SECRET) {
        throw new Error('HOTMART_CLIENT_ID e HOTMART_CLIENT_SECRET são obrigatórios no .env');
    }
    const basicAuth = Buffer.from(`${HOTMART_CLIENT_ID}:${HOTMART_CLIENT_SECRET}`).toString('base64');
    const response = await axios_1.default.post('https://api-sec-vlc.hotmart.com/security/oauth/token', new URLSearchParams({ grant_type: 'client_credentials' }), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
        }
    });
    return response.data.access_token;
}
// ═══════════════════════════════════════════════════════════
// HOTMART: BUSCAR TODAS AS TURMAS
// ═══════════════════════════════════════════════════════════
async function fetchAllHotmartClasses(accessToken) {
    console.log('📡 [Hotmart] Buscando todas as turmas via utilizadores...');
    const classMap = new Map();
    let nextPageToken = null;
    let pageCount = 0;
    let totalUsers = 0;
    do {
        pageCount++;
        let requestUrl = `https://developers.hotmart.com/club/api/v1/users?subdomain=${HOTMART_SUBDOMAIN}`;
        if (nextPageToken) {
            requestUrl += `&page_token=${encodeURIComponent(nextPageToken)}`;
        }
        const response = await axios_1.default.get(requestUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        const users = response.data.users || response.data.items || response.data.data || [];
        const pageInfo = response.data.page_info || response.data.pageInfo || {};
        totalUsers += users.length;
        for (const user of users) {
            const classId = user.class_id?.trim();
            const className = user.class_name?.trim();
            const email = user.email?.trim();
            if (classId) {
                if (!classMap.has(classId)) {
                    classMap.set(classId, {
                        classId,
                        className: className || undefined,
                        studentCount: 0,
                        studentEmails: []
                    });
                }
                const cls = classMap.get(classId);
                cls.studentCount++;
                if (email) {
                    cls.studentEmails.push(email);
                }
                // Atualizar nome se disponível e ainda não temos
                if (className && !cls.className) {
                    cls.className = className;
                }
            }
        }
        nextPageToken = pageInfo.next_page_token || null;
        if (pageCount % 10 === 0) {
            console.log(`   📄 Página ${pageCount}: ${users.length} users, ${classMap.size} turmas únicas`);
        }
        if (nextPageToken) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    } while (nextPageToken);
    console.log(`✅ [Hotmart] Concluído: ${totalUsers} users processados, ${classMap.size} turmas encontradas`);
    return Array.from(classMap.values()).sort((a, b) => b.studentCount - a.studentCount);
}
// ═══════════════════════════════════════════════════════════
// CURSEDUCA: BUSCAR TODOS OS GRUPOS
// ═══════════════════════════════════════════════════════════
async function fetchAllCurseducaGroups() {
    console.log('📡 [CursEduca] Buscando todos os grupos...');
    const headers = {
        'Authorization': `Bearer ${CURSEDUCA_ACCESS_TOKEN}`,
        'api_key': CURSEDUCA_API_KEY,
        'Content-Type': 'application/json'
    };
    try {
        const response = await axios_1.default.get(`${CURSEDUCA_API_URL}/groups`, {
            headers,
            timeout: 30000
        });
        const groups = Array.isArray(response.data)
            ? response.data
            : response.data?.data || response.data?.groups || [];
        console.log(`✅ [CursEduca] ${groups.length} grupos encontrados`);
        // Buscar contagem de membros de cada grupo
        const groupsWithCount = [];
        for (const group of groups) {
            try {
                const membersResponse = await axios_1.default.get(`${CURSEDUCA_API_URL}/reports/group/members`, {
                    params: { groupId: group.id, limit: 1, offset: 0 },
                    headers,
                    timeout: 10000
                });
                // Tentar obter total de várias formas
                const totalMembers = membersResponse.data?.total ||
                    membersResponse.data?.data?.length ||
                    membersResponse.data?.length || 0;
                groupsWithCount.push({
                    id: group.id,
                    uuid: group.uuid,
                    name: group.name,
                    memberCount: totalMembers
                });
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            catch (error) {
                groupsWithCount.push({
                    id: group.id,
                    uuid: group.uuid,
                    name: group.name,
                    memberCount: 0
                });
            }
        }
        return groupsWithCount;
    }
    catch (error) {
        console.error('❌ [CursEduca] Erro:', error.message);
        return [];
    }
}
// ═══════════════════════════════════════════════════════════
// DATABASE: BUSCAR TURMAS LOCAIS
// ═══════════════════════════════════════════════════════════
async function fetchDatabaseClasses() {
    console.log('📡 [Database] Buscando turmas locais...');
    const classes = await Class_1.Class.find({}).lean();
    console.log(`✅ [Database] ${classes.length} turmas encontradas`);
    return classes;
}
// ═══════════════════════════════════════════════════════════
// MAIN: DIAGNÓSTICO
// ═══════════════════════════════════════════════════════════
async function runDiagnostic() {
    console.log('\n' + '═'.repeat(60));
    console.log('🔍 DIAGNÓSTICO DE SINCRONIZAÇÃO DE TURMAS');
    console.log('═'.repeat(60) + '\n');
    // Conectar MongoDB
    console.log('🔌 Conectando ao MongoDB...');
    await mongoose_1.default.connect(MONGODB_URI);
    console.log('✅ MongoDB conectado\n');
    // 1. Buscar turmas Hotmart
    console.log('─'.repeat(40));
    console.log('📊 PASSO 1: HOTMART');
    console.log('─'.repeat(40));
    const accessToken = await getHotmartAccessToken();
    const hotmartClasses = await fetchAllHotmartClasses(accessToken);
    // 2. Buscar grupos CursEduca
    console.log('\n' + '─'.repeat(40));
    console.log('📊 PASSO 2: CURSEDUCA');
    console.log('─'.repeat(40));
    const curseducaGroups = await fetchAllCurseducaGroups();
    // 3. Buscar turmas da BD
    console.log('\n' + '─'.repeat(40));
    console.log('📊 PASSO 3: DATABASE');
    console.log('─'.repeat(40));
    const dbClasses = await fetchDatabaseClasses();
    // 4. Criar conjuntos para comparação
    const hotmartClassIds = new Set(hotmartClasses.map(c => c.classId));
    const curseducaGroupIds = new Set(curseducaGroups.map(g => g.uuid));
    const dbClassIds = new Set(dbClasses.map(c => c.classId));
    // 5. Encontrar diferenças
    const missingInDB = [];
    // Turmas Hotmart em falta
    for (const cls of hotmartClasses) {
        if (!dbClassIds.has(cls.classId)) {
            missingInDB.push({
                classId: cls.classId,
                className: cls.className,
                source: 'hotmart'
            });
        }
    }
    // Grupos CursEduca em falta
    for (const group of curseducaGroups) {
        if (!dbClassIds.has(group.uuid)) {
            missingInDB.push({
                classId: group.uuid,
                className: group.name,
                source: 'curseduca'
            });
        }
    }
    // Turmas na BD que não existem nas APIs
    const extraInDB = dbClasses
        .filter(c => !hotmartClassIds.has(c.classId) && !curseducaGroupIds.has(c.classId))
        .map(c => ({ classId: c.classId, name: c.name }));
    // Verificar turmas esperadas
    const expectedButMissing = [];
    const expectedAndFound = [];
    for (const expected of EXPECTED_CLASSES) {
        const dbClass = dbClasses.find(c => c.classId === expected.classId);
        if (dbClass) {
            expectedAndFound.push({
                name: expected.name,
                classId: expected.classId,
                dbName: dbClass.name
            });
        }
        else {
            expectedButMissing.push(expected);
        }
    }
    // Estatísticas da BD
    const activeClasses = dbClasses.filter(c => c.isActive).length;
    const inactiveClasses = dbClasses.filter(c => !c.isActive).length;
    const hotmartSyncClasses = dbClasses.filter(c => c.source === 'hotmart_sync').length;
    const curseducaSyncClasses = dbClasses.filter(c => c.source === 'curseduca_sync').length;
    const manualClasses = dbClasses.filter(c => c.source === 'manual').length;
    // Recomendações
    const recommendations = [];
    if (missingInDB.length > 0) {
        recommendations.push(`🔴 ${missingInDB.length} turmas estão nas APIs mas NÃO na BD - precisam ser sincronizadas`);
    }
    if (expectedButMissing.length > 0) {
        recommendations.push(`🔴 ${expectedButMissing.length} turmas esperadas NÃO estão na BD - verificar IDs`);
    }
    const classesWithoutName = dbClasses.filter(c => !c.name || c.name.startsWith('Turma '));
    if (classesWithoutName.length > 0) {
        recommendations.push(`🟡 ${classesWithoutName.length} turmas têm nome genérico "Turma X" - podem precisar de nome manual`);
    }
    if (extraInDB.length > 0) {
        recommendations.push(`🟡 ${extraInDB.length} turmas na BD não existem nas APIs - podem ser órfãs ou manuais`);
    }
    if (hotmartClasses.length !== hotmartSyncClasses) {
        recommendations.push(`📊 Hotmart: ${hotmartClasses.length} turmas na API vs ${hotmartSyncClasses} na BD`);
    }
    // Criar relatório
    const report = {
        timestamp: new Date().toISOString(),
        hotmart: {
            totalClassesFound: hotmartClasses.length,
            classesWithStudents: hotmartClasses.filter(c => c.studentCount > 0).length,
            classesWithoutStudents: hotmartClasses.filter(c => c.studentCount === 0).length,
            allClasses: hotmartClasses
        },
        curseduca: {
            totalGroupsFound: curseducaGroups.length,
            allGroups: curseducaGroups
        },
        database: {
            totalClassesInDB: dbClasses.length,
            activeClasses,
            inactiveClasses,
            hotmartSyncClasses,
            curseducaSyncClasses,
            manualClasses
        },
        comparison: {
            missingInDB,
            extraInDB,
            expectedButMissing,
            expectedAndFound
        },
        recommendations
    };
    return report;
}
// ═══════════════════════════════════════════════════════════
// OUTPUT: IMPRIMIR E GUARDAR RELATÓRIO
// ═══════════════════════════════════════════════════════════
async function main() {
    try {
        const report = await runDiagnostic();
        // Imprimir resumo
        console.log('\n' + '═'.repeat(60));
        console.log('📋 RELATÓRIO DE DIAGNÓSTICO');
        console.log('═'.repeat(60));
        console.log('\n📊 HOTMART:');
        console.log(`   Total de turmas encontradas: ${report.hotmart.totalClassesFound}`);
        console.log(`   Com alunos: ${report.hotmart.classesWithStudents}`);
        console.log(`   Sem alunos: ${report.hotmart.classesWithoutStudents}`);
        console.log('\n📊 CURSEDUCA:');
        console.log(`   Total de grupos encontrados: ${report.curseduca.totalGroupsFound}`);
        report.curseduca.allGroups.forEach(g => {
            console.log(`   - ${g.name} (ID: ${g.id}, UUID: ${g.uuid})`);
        });
        console.log('\n📊 DATABASE:');
        console.log(`   Total de turmas: ${report.database.totalClassesInDB}`);
        console.log(`   Ativas: ${report.database.activeClasses}`);
        console.log(`   Inativas: ${report.database.inactiveClasses}`);
        console.log(`   Por fonte:`);
        console.log(`     - hotmart_sync: ${report.database.hotmartSyncClasses}`);
        console.log(`     - curseduca_sync: ${report.database.curseducaSyncClasses}`);
        console.log(`     - manual: ${report.database.manualClasses}`);
        console.log('\n⚠️  TURMAS EM FALTA NA BD:');
        if (report.comparison.missingInDB.length === 0) {
            console.log('   ✅ Nenhuma turma em falta!');
        }
        else {
            report.comparison.missingInDB.slice(0, 20).forEach(c => {
                console.log(`   ❌ [${c.source}] ${c.classId} - ${c.className || 'Sem nome'}`);
            });
            if (report.comparison.missingInDB.length > 20) {
                console.log(`   ... e mais ${report.comparison.missingInDB.length - 20} turmas`);
            }
        }
        console.log('\n🎯 TURMAS ESPERADAS:');
        console.log('   Encontradas:');
        report.comparison.expectedAndFound.forEach(c => {
            const match = c.name === c.dbName ? '✅' : '⚠️ nome diferente';
            console.log(`   ${match} ${c.classId} - Esperado: "${c.name}" | BD: "${c.dbName}"`);
        });
        console.log('   Em falta:');
        if (report.comparison.expectedButMissing.length === 0) {
            console.log('   ✅ Todas as turmas esperadas foram encontradas!');
        }
        else {
            report.comparison.expectedButMissing.forEach(c => {
                console.log(`   ❌ ${c.classId} - ${c.name}`);
            });
        }
        console.log('\n📝 RECOMENDAÇÕES:');
        report.recommendations.forEach(r => console.log(`   ${r}`));
        // Guardar relatório em ficheiro
        const outputDir = path_1.default.join(__dirname, '..', 'diagnostic-results');
        if (!fs_1.default.existsSync(outputDir)) {
            fs_1.default.mkdirSync(outputDir, { recursive: true });
        }
        const filename = `classes-diagnostic-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const filepath = path_1.default.join(outputDir, filename);
        fs_1.default.writeFileSync(filepath, JSON.stringify(report, null, 2));
        console.log(`\n💾 Relatório completo guardado em: ${filepath}`);
        // Listar top 20 turmas Hotmart por número de alunos
        console.log('\n📊 TOP 20 TURMAS HOTMART (por número de alunos):');
        report.hotmart.allClasses.slice(0, 20).forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.classId} - ${c.className || 'Sem nome'} (${c.studentCount} alunos)`);
        });
    }
    catch (error) {
        console.error('\n❌ ERRO:', error.message);
        console.error(error.stack);
    }
    finally {
        await mongoose_1.default.disconnect();
        console.log('\n🔌 MongoDB desconectado');
    }
}
main();
