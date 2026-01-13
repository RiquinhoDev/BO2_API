"use strict";
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
// Script para testar processamento de OGI_V1 especificamente
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";
async function main() {
    console.log('━'.repeat(60));
    console.log('TESTE: Processar OGI_V1 de utilizador com tags órfãs');
    console.log('━'.repeat(60));
    await mongoose_1.default.connect(MONGO_URI);
    console.log('MongoDB conectado\n');
    const { User, UserProduct, Product } = await Promise.resolve().then(() => __importStar(require('../src/models')));
    const activeCampaignService = (await Promise.resolve().then(() => __importStar(require('../src/services/activeCampaign/activeCampaignService')))).default;
    const tagOrchestratorV2 = (await Promise.resolve().then(() => __importStar(require('../src/services/activeCampaign/tagOrchestrator.service')))).default;
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
    console.log(`Tags BO conhecidas (${boTagNames.size})\n`);
    // Utilizador de teste
    const testEmail = 'andregaspar1996@gmail.com';
    const user = await User.findOne({ email: testEmail }).lean();
    if (!user) {
        console.log('User não encontrado!');
        process.exit(1);
    }
    console.log(`Utilizador: ${testEmail}`);
    console.log(`User ID: ${user._id}`);
    // Buscar tags AC ANTES
    console.log('\n📡 Tags AC ANTES:');
    let tagsBefore = [];
    try {
        tagsBefore = await activeCampaignService.getContactTagsByEmail(testEmail);
        const boTagsBefore = tagsBefore.filter(t => boTagNames.has(t));
        console.log(`   Todas: ${tagsBefore.length}`);
        console.log(`   BO: [${boTagsBefore.join(', ')}]`);
    }
    catch (err) {
        console.log(`   Erro: ${err.message}`);
    }
    // Buscar UserProducts
    const userProducts = await UserProduct.find({ userId: user._id, status: 'ACTIVE' })
        .populate('productId', 'code')
        .lean();
    console.log(`\nUserProducts ativos: ${userProducts.length}`);
    for (const up of userProducts) {
        console.log(`   - ${up.productId?.code || 'N/A'}`);
    }
    // Encontrar o UserProduct de OGI_V1
    const ogiUserProduct = userProducts.find(up => up.productId?.code === 'OGI_V1');
    if (!ogiUserProduct) {
        console.log('\nUser não tem OGI_V1!');
        process.exit(1);
    }
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`PROCESSANDO: OGI_V1 (UserProduct: ${ogiUserProduct._id})`);
    console.log(`═══════════════════════════════════════════════════════════`);
    const userIdStr = user._id.toString();
    const productIdStr = ogiUserProduct.productId._id.toString();
    // Calcular tags esperadas
    console.log('\n🧠 Calculando tags esperadas...');
    try {
        const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr);
        console.log(`   Tags esperadas: [${(evaluation.tagsToApply || []).join(', ')}]`);
        console.log(`   Tags a remover: [${(evaluation.tagsToRemove || []).join(', ')}]`);
        console.log(`   Matched rules: ${evaluation.matchedRules?.length || 0}`);
    }
    catch (err) {
        console.log(`   Erro DecisionEngine: ${err.message}`);
    }
    // Executar orchestrator
    console.log('\n🚀 Executando tagOrchestratorV2.orchestrateUserProduct()...');
    try {
        const result = await tagOrchestratorV2.orchestrateUserProduct(userIdStr, productIdStr);
        console.log(`   Success: ${result.success}`);
        console.log(`   Tags Applied: ${result.tagsApplied?.length || 0} → [${(result.tagsApplied || []).join(', ')}]`);
        console.log(`   Tags Removed: ${result.tagsRemoved?.length || 0} → [${(result.tagsRemoved || []).join(', ')}]`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    }
    catch (err) {
        console.log(`   Erro: ${err.message}`);
    }
    // Verificar tags DEPOIS
    console.log('\n📡 Tags AC DEPOIS:');
    try {
        const tagsAfter = await activeCampaignService.getContactTagsByEmail(testEmail);
        const boTagsAfter = tagsAfter.filter(t => boTagNames.has(t));
        console.log(`   Todas: ${tagsAfter.length}`);
        console.log(`   BO: [${boTagsAfter.join(', ')}]`);
        // Comparar
        const boTagsBefore = tagsBefore.filter(t => boTagNames.has(t));
        const removidas = boTagsBefore.filter(t => !boTagsAfter.includes(t));
        const adicionadas = boTagsAfter.filter(t => !boTagsBefore.includes(t));
        if (removidas.length > 0) {
            console.log(`\n   ✅ Removidas: [${removidas.join(', ')}]`);
        }
        if (adicionadas.length > 0) {
            console.log(`   ✅ Adicionadas: [${adicionadas.join(', ')}]`);
        }
        if (removidas.length === 0 && adicionadas.length === 0) {
            console.log(`\n   ℹ️ Nenhuma alteração`);
        }
    }
    catch (err) {
        console.log(`   Erro: ${err.message}`);
    }
    console.log('\n━'.repeat(60));
    console.log('Teste completo!');
    console.log('━'.repeat(60));
    await mongoose_1.default.disconnect();
    process.exit(0);
}
main().catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
});
