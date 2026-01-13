"use strict";
// ════════════════════════════════════════════════════════════
// TESTE: Endpoint /api/cron/tag-rules-only
// Valida que tags foram correctamente aplicadas/removidas
// ════════════════════════════════════════════════════════════
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";
const API_URL = process.env.API_URL || 'http://localhost:3001';
// Utilizadores específicos para monitorizar (incluir Rui)
const USERS_TO_MONITOR = [
    'marco_vidigal@hotmail.com',
    "ludovicsilva@hotmail.com",
    "ruifilipespteixeira@gmail.com",
    "joaomcf37@gmail.com"
];
async function main() {
    const startTime = Date.now();
    console.log('━'.repeat(70));
    console.log('TESTE: Endpoint /api/cron/tag-rules-only');
    console.log('━'.repeat(70));
    console.log('');
    await mongoose_1.default.connect(MONGO_URI);
    console.log('MongoDB conectado\n');
    const { User, UserProduct, Product } = await Promise.resolve().then(() => __importStar(require('../src/models')));
    const activeCampaignService = (await Promise.resolve().then(() => __importStar(require('../src/services/activeCampaign/activeCampaignService')))).default;
    const { decisionEngine } = await Promise.resolve().then(() => __importStar(require('../src/services/activeCampaign/decisionEngine.service')));
    const TagRule = (await Promise.resolve().then(() => __importStar(require('../src/models/acTags/TagRule')))).default;
    // Get BO tag names
    const allTagRules = await TagRule.find({ isActive: true }).select('actions.addTag').lean();
    const boTagNames = new Set();
    for (const rule of allTagRules) {
        const tagName = rule.actions?.addTag;
        if (tagName)
            boTagNames.add(tagName);
    }
    // ════════════════════════════════════════════════════════════
    // FASE 1: Capturar estado ANTES
    // ════════════════════════════════════════════════════════════
    console.log('═'.repeat(70));
    console.log('FASE 1: Capturar estado ANTES do endpoint');
    console.log('═'.repeat(70));
    // Buscar todos os UserProducts ativos (excluindo DISCORD)
    const discordProducts = await Product.find({ code: { $in: ['DISCORD_COMMUNITY', 'DISCORD'] } }).select('_id').lean();
    const discordProductIds = new Set(discordProducts.map((p) => p._id.toString()));
    const allUserProducts = await UserProduct.find({ status: 'ACTIVE' })
        .populate('userId', 'email')
        .populate('productId', 'code')
        .lean();
    // Filtrar DISCORD e órfãos
    const validUserProducts = allUserProducts.filter(up => {
        if (!up.userId?.email)
            return false;
        const productIdStr = up.productId?._id?.toString();
        if (discordProductIds.has(productIdStr))
            return false;
        return true;
    });
    console.log(`Total UserProducts a verificar: ${validUserProducts.length}`);
    const userStates = [];
    let processed = 0;
    // Se temos users específicos para monitorizar, buscar TODOS os seus UserProducts
    let usersToCheck = [];
    if (USERS_TO_MONITOR.length > 0 && USERS_TO_MONITOR[0] !== '') {
        // Buscar users pelos emails
        const monitoredUsers = await User.find({ email: { $in: USERS_TO_MONITOR } }).lean();
        const monitoredUserIds = monitoredUsers.map(u => u._id.toString());
        console.log(`\n📋 Utilizadores a monitorizar: ${USERS_TO_MONITOR.length}`);
        for (const email of USERS_TO_MONITOR) {
            const found = monitoredUsers.find(u => u.email === email);
            console.log(`   ${email}: ${found ? '✅ encontrado' : '❌ NÃO encontrado'}`);
        }
        // Buscar TODOS os UserProducts destes users (não filtrados por DISCORD)
        const monitoredUserProducts = await UserProduct.find({
            userId: { $in: monitoredUserIds },
            status: 'ACTIVE'
        })
            .populate('userId', 'email')
            .populate('productId', 'code')
            .lean();
        // Filtrar apenas produtos com regras de tags (não DISCORD)
        usersToCheck = monitoredUserProducts.filter(up => {
            const productIdStr = up.productId?._id?.toString();
            if (discordProductIds.has(productIdStr)) {
                console.log(`   ⚠️ ${up.userId?.email} - ${up.productId?.code}: ignorado (DISCORD)`);
                return false;
            }
            return true;
        });
        console.log(`\n✅ ${usersToCheck.length} UserProducts a processar:`);
        for (const up of usersToCheck) {
            console.log(`   ${up.userId?.email} - ${up.productId?.code}`);
        }
    }
    else {
        // Limitar a 100 para não demorar muito
        usersToCheck = validUserProducts.slice(0, 100);
        console.log(`\nA monitorizar amostra de ${usersToCheck.length} utilizadores`);
    }
    console.log('\nA capturar estado ANTES...');
    for (const up of usersToCheck) {
        try {
            const email = up.userId.email;
            const userIdStr = up.userId._id.toString();
            const productIdStr = up.productId._id.toString();
            const productCode = up.productId.code;
            // Tags actuais na AC
            const acTags = await activeCampaignService.getContactTagsByEmail(email);
            const boTags = acTags.filter((t) => boTagNames.has(t));
            // Tags esperadas
            const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr);
            const expectedTags = evaluation.tagsToApply || [];
            userStates.push({
                email,
                userId: userIdStr,
                productId: productIdStr,
                productCode,
                tagsBefore: boTags,
                expectedTags
            });
            processed++;
            if (processed % 10 === 0) {
                console.log(`   ${processed}/${usersToCheck.length} processados...`);
            }
        }
        catch (err) {
            // skip
        }
    }
    console.log(`\n✅ Estado ANTES capturado para ${userStates.length} utilizadores`);
    // Mostrar estado dos users monitorizados
    const monitoredBefore = userStates.filter(s => USERS_TO_MONITOR.includes(s.email));
    if (monitoredBefore.length > 0) {
        console.log('\n📋 Estado ANTES dos utilizadores monitorizados:');
        for (const s of monitoredBefore) {
            console.log(`   ${s.email} (${s.productCode}):`);
            console.log(`      Tags AC: [${s.tagsBefore.join(', ')}]`);
            console.log(`      Esperado: [${s.expectedTags.join(', ')}]`);
        }
    }
    // ════════════════════════════════════════════════════════════
    // FASE 2: Chamar endpoint
    // ════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('FASE 2: Chamar endpoint /api/cron/tag-rules-only');
    console.log('═'.repeat(70));
    const endpointUrl = `${API_URL}/api/cron/tag-rules-only`;
    console.log(`\nURL: ${endpointUrl}`);
    console.log('A chamar endpoint... (pode demorar até 2 horas)\n');
    console.log('⚠️  Certifica-te que o servidor está a correr: npm run dev\n');
    const endpointStart = Date.now();
    let endpointResult = null;
    let endpointError = null;
    try {
        // Timeout de 2 horas (7200000ms) para pipelines longos
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 7200000);
        const response = await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        endpointResult = await response.json();
        const endpointDuration = Math.floor((Date.now() - endpointStart) / 1000);
        console.log(`✅ Endpoint respondeu em ${Math.floor(endpointDuration / 60)}min ${endpointDuration % 60}s`);
        console.log(`   Success: ${endpointResult.success}`);
        console.log(`   Tags aplicadas: ${endpointResult.summary?.tagsApplied || 0}`);
        console.log(`   Tags removidas: ${endpointResult.summary?.tagsRemoved || 0}`);
        if (endpointResult.errors?.length > 0) {
            console.log(`   Erros: ${endpointResult.errors.length}`);
        }
    }
    catch (err) {
        endpointError = err.message;
        if (err.cause) {
            console.log(`❌ Erro ao chamar endpoint: ${err.message}`);
            console.log(`   Causa: ${err.cause.code || err.cause.message || err.cause}`);
            if (err.cause.code === 'ECONNREFUSED') {
                console.log('\n   💡 O servidor não está a correr! Executa: npm run dev');
            }
        }
        else {
            console.log(`❌ Erro ao chamar endpoint: ${err.message}`);
        }
    }
    // ════════════════════════════════════════════════════════════
    // FASE 3: Capturar estado DEPOIS e detectar discrepâncias
    // ════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('FASE 3: Verificar estado DEPOIS e detectar discrepâncias');
    console.log('═'.repeat(70));
    const discrepancies = [];
    processed = 0;
    console.log('\nA verificar estado DEPOIS...');
    for (const state of userStates) {
        try {
            // Tags actuais na AC (DEPOIS do endpoint)
            const acTagsAfter = await activeCampaignService.getContactTagsByEmail(state.email);
            const boTagsAfter = acTagsAfter.filter((t) => boTagNames.has(t));
            // Filtrar apenas tags do produto actual
            const productPrefix = state.productCode.toUpperCase();
            const productBoTagsAfter = boTagsAfter.filter((t) => t.toUpperCase().startsWith(productPrefix));
            const productExpectedTags = state.expectedTags.filter((t) => t.toUpperCase().startsWith(productPrefix));
            // Detectar discrepâncias
            // Tags que deviam ter sido INSERIDAS mas NÃO foram
            for (const expectedTag of productExpectedTags) {
                if (!productBoTagsAfter.includes(expectedTag)) {
                    discrepancies.push({
                        email: state.email,
                        productCode: state.productCode,
                        type: 'NOT_INSERTED',
                        tag: expectedTag,
                        expected: productExpectedTags,
                        actual: productBoTagsAfter
                    });
                }
            }
            // Tags que deviam ter sido REMOVIDAS mas NÃO foram
            for (const actualTag of productBoTagsAfter) {
                if (!productExpectedTags.includes(actualTag)) {
                    discrepancies.push({
                        email: state.email,
                        productCode: state.productCode,
                        type: 'NOT_REMOVED',
                        tag: actualTag,
                        expected: productExpectedTags,
                        actual: productBoTagsAfter
                    });
                }
            }
            processed++;
            if (processed % 10 === 0) {
                console.log(`   ${processed}/${userStates.length} verificados...`);
            }
        }
        catch (err) {
            // skip
        }
    }
    // Mostrar estado DEPOIS dos users monitorizados
    if (USERS_TO_MONITOR.length > 0 && USERS_TO_MONITOR[0] !== '') {
        console.log('\n📋 Estado DEPOIS dos utilizadores monitorizados:');
        for (const email of USERS_TO_MONITOR) {
            try {
                const acTagsAfter = await activeCampaignService.getContactTagsByEmail(email);
                const boTagsAfter = acTagsAfter.filter((t) => boTagNames.has(t));
                const state = userStates.find(s => s.email === email);
                console.log(`   ${email}:`);
                console.log(`      Tags AC DEPOIS: [${boTagsAfter.join(', ')}]`);
                console.log(`      Esperado: [${state?.expectedTags.join(', ') || 'N/A'}]`);
                // Verificar se está correcto
                const productPrefix = state?.productCode?.toUpperCase() || '';
                const productTags = boTagsAfter.filter((t) => t.toUpperCase().startsWith(productPrefix));
                const productExpected = (state?.expectedTags || []).filter((t) => t.toUpperCase().startsWith(productPrefix));
                const isCorrect = productTags.length === productExpected.length &&
                    productTags.every(t => productExpected.includes(t));
                if (isCorrect) {
                    console.log(`      ✅ CORRECTO!`);
                }
                else {
                    const extra = productTags.filter(t => !productExpected.includes(t));
                    const missing = productExpected.filter(t => !productTags.includes(t));
                    if (extra.length > 0)
                        console.log(`      ❌ Extra: [${extra.join(', ')}]`);
                    if (missing.length > 0)
                        console.log(`      ❌ Falta: [${missing.join(', ')}]`);
                }
            }
            catch (err) {
                console.log(`   ${email}: Erro ao verificar`);
            }
        }
    }
    // ════════════════════════════════════════════════════════════
    // FASE 4: Guardar relatório
    // ════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(70));
    console.log('FASE 4: Relatório de discrepâncias');
    console.log('═'.repeat(70));
    const totalDuration = Math.floor((Date.now() - startTime) / 1000);
    // Agrupar discrepâncias por tipo
    const notInserted = discrepancies.filter(d => d.type === 'NOT_INSERTED');
    const notRemoved = discrepancies.filter(d => d.type === 'NOT_REMOVED');
    console.log(`\n📊 RESUMO:`);
    console.log(`   Total utilizadores verificados: ${userStates.length}`);
    console.log(`   Total discrepâncias: ${discrepancies.length}`);
    console.log(`      - Tags NÃO inseridas (deviam estar): ${notInserted.length}`);
    console.log(`      - Tags NÃO removidas (não deviam estar): ${notRemoved.length}`);
    console.log(`   Duração total: ${Math.floor(totalDuration / 60)}min ${totalDuration % 60}s`);
    if (discrepancies.length === 0) {
        console.log('\n🎉 PERFEITO! Nenhuma discrepância encontrada!');
    }
    else {
        console.log('\n❌ DISCREPÂNCIAS ENCONTRADAS:');
        if (notInserted.length > 0) {
            console.log('\n   📥 Tags que DEVIAM ser inseridas mas NÃO foram:');
            for (const d of notInserted.slice(0, 20)) {
                console.log(`      ${d.email} (${d.productCode}): "${d.tag}"`);
            }
            if (notInserted.length > 20) {
                console.log(`      ... e mais ${notInserted.length - 20}`);
            }
        }
        if (notRemoved.length > 0) {
            console.log('\n   📤 Tags que DEVIAM ser removidas mas NÃO foram:');
            for (const d of notRemoved.slice(0, 20)) {
                console.log(`      ${d.email} (${d.productCode}): "${d.tag}"`);
            }
            if (notRemoved.length > 20) {
                console.log(`      ... e mais ${notRemoved.length - 20}`);
            }
        }
    }
    // Guardar relatório em ficheiro
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportDir = path_1.default.join(process.cwd(), 'test-results');
    if (!fs_1.default.existsSync(reportDir)) {
        fs_1.default.mkdirSync(reportDir, { recursive: true });
    }
    const report = {
        timestamp: new Date().toISOString(),
        endpoint: 'tag-rules-only',
        endpointResult: endpointResult ? {
            success: endpointResult.success,
            tagsApplied: endpointResult.summary?.tagsApplied || 0,
            tagsRemoved: endpointResult.summary?.tagsRemoved || 0,
            errors: endpointResult.errors?.length || 0
        } : { error: endpointError },
        usersVerified: userStates.length,
        discrepancies: {
            total: discrepancies.length,
            notInserted: notInserted.length,
            notRemoved: notRemoved.length,
            details: discrepancies
        },
        duration: totalDuration
    };
    const reportPath = path_1.default.join(reportDir, `tag-rules-test-${timestamp}.json`);
    fs_1.default.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n💾 Relatório guardado: ${reportPath}`);
    console.log('\n' + '━'.repeat(70));
    console.log('Teste completo!');
    console.log('━'.repeat(70));
    await mongoose_1.default.disconnect();
    process.exit(0);
}
main().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
