"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../src/models/User"));
async function verifyEmailTracking() {
    try {
        console.log('📧 DIAGNÓSTICO: Active Campaign Email Tracking\n');
        console.log('='.repeat(70));
        await mongoose_1.default.connect(process.env.MONGO_URI);
        // 1. Users com emails enviados
        console.log('\n📊 USERS COM EMAILS ENVIADOS:\n');
        const usersWithEmails = await User_1.default.find({
            'activeCampaign.lastEmailSent': { $exists: true }
        });
        console.log(`Total: ${usersWithEmails.length} users\n`);
        if (usersWithEmails.length === 0) {
            console.log('⚠️  Nenhum email enviado ainda ou tracking não está ativo.');
        }
        else {
            // Sample dos primeiros 10
            console.log('Sample (primeiros 10):\n');
            usersWithEmails.slice(0, 10).forEach((user, idx) => {
                console.log(`${idx + 1}. ${user.email}:`);
                console.log(`   Last Email: ${user.activeCampaign?.lastEmailSent}`);
                console.log(`   Campaign ID: ${user.activeCampaign?.lastCampaignId || 'N/A'}`);
                console.log(`   Tags: ${user.activeCampaign?.tags?.join(', ') || 'N/A'}`);
                console.log(`   Is Active: ${user.activeCampaign?.isActive ?? 'N/A'}`);
                console.log('');
            });
        }
        // 2. Verificar cooldown periods
        console.log('='.repeat(70));
        console.log('\n📊 COOLDOWN ANALYSIS:\n');
        const now = new Date();
        const cooldownPeriods = [1, 3, 7, 14, 30]; // dias
        for (const days of cooldownPeriods) {
            const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
            const usersInCooldown = await User_1.default.countDocuments({
                'activeCampaign.lastEmailSent': { $gte: cutoffDate }
            });
            console.log(`Users com email nos últimos ${days} dia(s): ${usersInCooldown}`);
        }
        // 3. Breakdown por tags
        console.log('\n' + '='.repeat(70));
        console.log('\n📊 BREAKDOWN POR TAGS:\n');
        const tagBreakdown = await User_1.default.aggregate([
            {
                $match: {
                    'activeCampaign.tags': { $exists: true, $ne: [] }
                }
            },
            { $unwind: '$activeCampaign.tags' },
            {
                $group: {
                    _id: '$activeCampaign.tags',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        if (tagBreakdown.length === 0) {
            console.log('Nenhuma tag Active Campaign encontrada.');
        }
        else {
            tagBreakdown.forEach(tag => {
                console.log(`  ${tag._id}: ${tag.count} users`);
            });
        }
        // 4. Users ativos vs inativos
        console.log('\n' + '='.repeat(70));
        console.log('\n📊 ACTIVE CAMPAIGN STATUS:\n');
        const activeUsers = await User_1.default.countDocuments({
            'activeCampaign.isActive': true
        });
        const inactiveUsers = await User_1.default.countDocuments({
            'activeCampaign.isActive': false
        });
        const noStatus = await User_1.default.countDocuments({
            'activeCampaign.isActive': { $exists: false }
        });
        console.log(`Active: ${activeUsers}`);
        console.log(`Inactive: ${inactiveUsers}`);
        console.log(`No Status: ${noStatus}`);
        // 5. Verificar users que deviam ter recebido re-engagement
        console.log('\n' + '='.repeat(70));
        console.log('\n📊 RE-ENGAGEMENT CANDIDATES:\n');
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const reEngagementCandidates = await User_1.default.find({
            lastActivityDate: { $lt: thirtyDaysAgo },
            $or: [
                { 'activeCampaign.lastEmailSent': { $exists: false } },
                { 'activeCampaign.lastEmailSent': { $lt: thirtyDaysAgo } }
            ]
        }).limit(10);
        console.log(`Total candidates: ${reEngagementCandidates.length}`);
        if (reEngagementCandidates.length > 0) {
            console.log('\nSample (primeiros 10):\n');
            reEngagementCandidates.forEach((user, idx) => {
                const daysSinceActivity = Math.floor((now.getTime() - (user.lastActivityDate?.getTime() || 0)) / (24 * 60 * 60 * 1000));
                console.log(`${idx + 1}. ${user.email}:`);
                console.log(`   Last Activity: ${daysSinceActivity} dias atrás`);
                console.log(`   Last Email: ${user.activeCampaign?.lastEmailSent || 'NUNCA'}`);
                console.log('');
            });
        }
        console.log('='.repeat(70));
        console.log('\n✅ Diagnóstico completo!\n');
    }
    catch (error) {
        console.error('\n❌ ERRO no diagnóstico:', error);
        throw error;
    }
    finally {
        await mongoose_1.default.disconnect();
    }
}
// Executar
verifyEmailTracking();
