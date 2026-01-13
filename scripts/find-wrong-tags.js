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
// Script para encontrar utilizadores com tags OGI_V1 ERRADAS
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const MONGO_URI = "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true";
async function main() {
    console.log('━'.repeat(60));
    console.log('Buscar utilizadores com tags OGI_V1 INCORRETAS');
    console.log('━'.repeat(60));
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
    console.log(`Tags BO: ${Array.from(boTagNames).join(', ')}\n`);
    // Buscar produto OGI_V1
    const ogiProduct = await Product.findOne({ code: 'OGI_V1' }).lean();
    if (!ogiProduct) {
        console.log('Produto OGI_V1 não encontrado!');
        process.exit(1);
    }
    // Buscar UserProducts OGI_V1 ativos (limite 30 para não demorar muito)
    const ogiUserProducts = await UserProduct.find({
        productId: ogiProduct._id,
        status: 'ACTIVE'
    })
        .populate('userId', 'email name')
        .limit(30)
        .lean();
    console.log(`A verificar ${ogiUserProducts.length} UserProducts OGI_V1...\n`);
    let wrongTagsCount = 0;
    let correctTagsCount = 0;
    const wrongUsers = [];
    for (const up of ogiUserProducts) {
        if (!up.userId?.email)
            continue;
        const email = up.userId.email;
        const userIdStr = up.userId._id.toString();
        const productIdStr = ogiProduct._id.toString();
        try {
            // Tags na AC
            const acTags = await activeCampaignService.getContactTagsByEmail(email);
            const acBoTags = acTags.filter(t => boTagNames.has(t));
            // Tags esperadas
            const evaluation = await decisionEngine.evaluateUserProduct(userIdStr, productIdStr);
            const expectedTags = evaluation.tagsToApply || [];
            // Comparar
            const wrongTags = acBoTags.filter(t => !expectedTags.includes(t));
            const missingTags = expectedTags.filter(t => !acBoTags.includes(t));
            if (wrongTags.length > 0 || missingTags.length > 0) {
                wrongTagsCount++;
                wrongUsers.push({
                    email,
                    acBoTags,
                    expectedTags,
                    wrongTags,
                    missingTags
                });
                console.log(`❌ ${email}`);
                console.log(`   AC: [${acBoTags.join(', ')}]`);
                console.log(`   Esperado: [${expectedTags.join(', ')}]`);
                if (wrongTags.length > 0)
                    console.log(`   Extra: [${wrongTags.join(', ')}]`);
                if (missingTags.length > 0)
                    console.log(`   Falta: [${missingTags.join(', ')}]`);
                console.log('');
            }
            else {
                correctTagsCount++;
                console.log(`✅ ${email} - OK`);
            }
        }
        catch (err) {
            console.log(`⚠️ ${email} - Erro: ${err.message}`);
        }
    }
    console.log('\n' + '━'.repeat(60));
    console.log('RESUMO:');
    console.log(`   Corretas: ${correctTagsCount}`);
    console.log(`   Erradas: ${wrongTagsCount}`);
    console.log('━'.repeat(60));
    await mongoose_1.default.disconnect();
    process.exit(0);
}
main().catch(err => {
    console.error('Erro:', err);
    process.exit(1);
});
