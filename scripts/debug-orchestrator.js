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
// Debug detalhado do orchestrator para um utilizador específico
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";
async function main() {
    console.log('━'.repeat(60));
    console.log('DEBUG: Passo a passo do Orchestrator');
    console.log('━'.repeat(60));
    await mongoose_1.default.connect(MONGO_URI);
    console.log('MongoDB conectado\n');
    const { User, UserProduct, Product } = await Promise.resolve().then(() => __importStar(require('../src/models')));
    const activeCampaignService = (await Promise.resolve().then(() => __importStar(require('../src/services/activeCampaign/activeCampaignService')))).default;
    const { decisionEngine } = await Promise.resolve().then(() => __importStar(require('../src/services/activeCampaign/decisionEngine.service')));
    // Utilizador com problema: adrianarodriguesnat.91@gmail.com
    // AC: [OGI_V1 - Inativo 21d, OGI_V1 - Progresso Baixo]
    // Esperado: [OGI_V1 - Ativo, OGI_V1 - Reativado]
    // Extra: [OGI_V1 - Inativo 21d, OGI_V1 - Progresso Baixo]
    // Falta: [OGI_V1 - Ativo, OGI_V1 - Reativado]
    const testEmail = 'adrianarodriguesnat.91@gmail.com';
    console.log(`Utilizador: ${testEmail}\n`);
    // 1. Buscar user e produto
    const user = await User.findOne({ email: testEmail }).lean();
    if (!user) {
        console.log('User não encontrado!');
        process.exit(1);
    }
    console.log(`1️⃣ User ID: ${user._id}`);
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).lean();
    if (!ogiProduct) {
        console.log('Produto OGI_V1 não encontrado!');
        process.exit(1);
    }
    console.log(`1️⃣ Product ID: ${ogiProduct._id}`);
    const userProduct = await UserProduct.findOne({ userId: user._id, productId: ogiProduct._id }).lean();
    if (!userProduct) {
        console.log('UserProduct não encontrado!');
        process.exit(1);
    }
    console.log(`1️⃣ UserProduct ID: ${userProduct._id}\n`);
    // 2. Buscar tags da AC
    console.log('2️⃣ Buscando tags da AC...');
    const acTags = await activeCampaignService.getContactTagsByEmail(testEmail);
    console.log(`   Todas as tags AC (${acTags.length}): ${acTags.join(', ')}`);
    // 3. Filtrar tags deste produto
    console.log('\n3️⃣ Filtrando tags do produto OGI_V1...');
    const productTagPrefixes = ['OGI_V1', 'OGI -'];
    console.log(`   Prefixos: ${productTagPrefixes.join(', ')}`);
    const currentProductTagsInAC = acTags.filter((tag) => productTagPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix.toUpperCase())));
    console.log(`   Tags OGI_V1 na AC: [${currentProductTagsInAC.join(', ')}]`);
    // 4. Chamar Decision Engine
    console.log('\n4️⃣ Chamando Decision Engine...');
    const decisions = await decisionEngine.evaluateUserProduct(user._id.toString(), ogiProduct._id.toString());
    console.log(`   tagsToApply: [${(decisions.tagsToApply || []).join(', ')}]`);
    console.log(`   tagsToRemove: [${(decisions.tagsToRemove || []).join(', ')}]`);
    console.log(`   matchedRules: ${decisions.matchedRules?.length || 0}`);
    // 5. Normalizar tags novas
    console.log('\n5️⃣ Normalizando tags novas...');
    const newBOTags = (decisions.tagsToApply || []).map((tag) => tag); // Já vem normalizado
    console.log(`   newBOTags: [${newBOTags.join(', ')}]`);
    // 6. Calcular DIFF
    console.log('\n6️⃣ Calculando DIFF...');
    // Função isBOTag do orchestrator
    function isBOTag(tagName) {
        return /^[A-Z_0-9]+ - .+$/.test(tagName);
    }
    const tagsToRemove = currentProductTagsInAC
        .filter((tag) => isBOTag(tag))
        .filter((tag) => !newBOTags.includes(tag));
    const tagsToAdd = newBOTags.filter((tag) => !currentProductTagsInAC.includes(tag));
    console.log(`   currentProductTagsInAC: [${currentProductTagsInAC.join(', ')}]`);
    console.log(`   newBOTags: [${newBOTags.join(', ')}]`);
    console.log('');
    console.log(`   📊 Tags a REMOVER: [${tagsToRemove.join(', ')}]`);
    console.log(`   📊 Tags a ADICIONAR: [${tagsToAdd.join(', ')}]`);
    // 7. Debug do filtro isBOTag
    console.log('\n7️⃣ Debug isBOTag para cada tag:');
    for (const tag of currentProductTagsInAC) {
        const isBO = isBOTag(tag);
        const inNewTags = newBOTags.includes(tag);
        const willRemove = isBO && !inNewTags;
        console.log(`   "${tag}": isBOTag=${isBO}, inNewTags=${inNewTags}, willRemove=${willRemove}`);
    }
    // 8. Testar remoção real
    if (tagsToRemove.length > 0) {
        console.log('\n8️⃣ Testando remoção de tags...');
        for (const tag of tagsToRemove) {
            console.log(`   A remover: "${tag}"`);
            try {
                const result = await activeCampaignService.removeTagFromUserProduct(user._id.toString(), ogiProduct._id.toString(), tag);
                console.log(`   ✅ Resultado: ${result}`);
            }
            catch (err) {
                console.log(`   ❌ Erro: ${err.message}`);
            }
        }
        // Verificar se removeu
        console.log('\n9️⃣ Verificando tags após remoção...');
        const tagsAfter = await activeCampaignService.getContactTagsByEmail(testEmail);
        const ogiTagsAfter = tagsAfter.filter((tag) => productTagPrefixes.some(prefix => tag.toUpperCase().startsWith(prefix.toUpperCase())));
        console.log(`   Tags OGI_V1 DEPOIS: [${ogiTagsAfter.join(', ')}]`);
    }
    else {
        console.log('\n8️⃣ Nenhuma tag a remover!');
    }
    console.log('\n' + '━'.repeat(60));
    console.log('Debug completo!');
    console.log('━'.repeat(60));
    await mongoose_1.default.disconnect();
    process.exit(0);
}
main().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
