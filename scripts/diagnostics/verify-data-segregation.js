"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const User_1 = __importDefault(require("../../src/models/User"));
const UserProduct_1 = __importDefault(require("../../src/models/UserProduct"));
async function verifyDataSegregation() {
    try {
        console.log('🔍 DIAGNÓSTICO: Segregação de Dados entre Plataformas\n');
        console.log('='.repeat(70));
        await mongoose_1.default.connect(process.env.MONGO_URI);
        const issues = [];
        // 1. Verificar Users com múltiplas plataformas
        console.log('\n📊 FASE 1: Verificando users multi-plataforma...\n');
        const users = await User_1.default.find({});
        console.log(`Total users: ${users.length}`);
        let multiPlatformCount = 0;
        let segregationOk = 0;
        let segregationIssues = 0;
        for (const user of users) {
            const platforms = [];
            // Check qual plataformas este user tem dados
            if (user.discord?.userId)
                platforms.push('discord');
            if (user.hotmart?.email)
                platforms.push('hotmart');
            if (user.curseduca?.email)
                platforms.push('curseduca');
            if (platforms.length > 1) {
                multiPlatformCount++;
                // Verificar se dados estão segregados corretamente
                const discordCourses = user.discord?.courses || [];
                const hotmartCourses = user.hotmart?.courses || [];
                const cursEducaCourses = user.curseduca?.courses || [];
                const consolidated = user.consolidatedCourses || [];
                // Check 1: Consolidated deve conter TODOS os courses de TODAS as plataformas
                const allPlatformCourses = [
                    ...discordCourses,
                    ...hotmartCourses,
                    ...cursEducaCourses
                ];
                const uniquePlatformCourses = Array.from(new Set(allPlatformCourses));
                const missingInConsolidated = uniquePlatformCourses.filter(course => !consolidated.includes(course));
                if (missingInConsolidated.length > 0) {
                    segregationIssues++;
                    issues.push({
                        userId: user._id.toString(),
                        email: user.email,
                        issue: 'CONSOLIDATED_COURSES_INCOMPLETE',
                        details: {
                            platforms,
                            discord: discordCourses,
                            hotmart: hotmartCourses,
                            curseduca: cursEducaCourses,
                            consolidated,
                            missing: missingInConsolidated
                        }
                    });
                }
                // Check 2: allPlatforms deve ter todas as plataformas com dados
                const expectedPlatforms = platforms.map(p => p.toUpperCase());
                const missingPlatforms = expectedPlatforms.filter(p => !user.allPlatforms?.includes(p));
                if (missingPlatforms.length > 0) {
                    segregationIssues++;
                    issues.push({
                        userId: user._id.toString(),
                        email: user.email,
                        issue: 'ALL_PLATFORMS_INCOMPLETE',
                        details: {
                            expected: expectedPlatforms,
                            actual: user.allPlatforms || [],
                            missing: missingPlatforms
                        }
                    });
                }
                if (missingInConsolidated.length === 0 && missingPlatforms.length === 0) {
                    segregationOk++;
                }
                // Log detalhado para primeiros 5 users
                if (multiPlatformCount <= 5) {
                    console.log(`\n✓ User ${user._id} (${user.email}):`);
                    console.log(`  Platforms: ${platforms.join(', ')}`);
                    console.log(`  Discord: [${discordCourses.join(', ')}]`);
                    console.log(`  Hotmart: [${hotmartCourses.join(', ')}]`);
                    console.log(`  CursEduca: [${cursEducaCourses.join(', ')}]`);
                    console.log(`  Consolidated: [${consolidated.join(', ')}]`);
                    console.log(`  All Platforms: [${user.allPlatforms?.join(', ') || 'NONE'}]`);
                    console.log(`  Status: ${missingInConsolidated.length === 0 && missingPlatforms.length === 0 ? '✅ OK' : '❌ ISSUES'}`);
                }
            }
        }
        console.log('\n' + '='.repeat(70));
        console.log('\n📊 RESULTADOS FASE 1:');
        console.log(`Total users: ${users.length}`);
        console.log(`Multi-platform users: ${multiPlatformCount}`);
        console.log(`Segregação OK: ${segregationOk}`);
        console.log(`Segregação com issues: ${segregationIssues}`);
        // 2. Verificar UserProducts (V2)
        console.log('\n' + '='.repeat(70));
        console.log('\n📊 FASE 2: Verificando UserProducts (Architecture V2)...\n');
        const userProducts = await UserProduct_1.default.find({}).populate('userId productId');
        console.log(`Total UserProducts: ${userProducts.length}`);
        if (userProducts.length === 0) {
            console.log('⚠️  AVISO: Nenhum UserProduct encontrado!');
            console.log('   A migração V1→V2 foi executada?');
        }
        else {
            // Verificar consistência UserProduct vs User
            let consistencyOk = 0;
            let consistencyIssues = 0;
            for (const up of userProducts) {
                const user = await User_1.default.findById(up.userId);
                if (!user) {
                    consistencyIssues++;
                    issues.push({
                        userId: up.userId.toString(),
                        email: 'UNKNOWN',
                        issue: 'USER_NOT_FOUND_FOR_USERPRODUCT',
                        details: { userProductId: up._id }
                    });
                    continue;
                }
                // Check se dados do UserProduct estão sincronizados com User
                const product = up.productId;
                if (product && product.code === 'OGI') {
                    // Verificar se user.hotmart tem os mesmos dados
                    if (!user.hotmart?.email) {
                        consistencyIssues++;
                        issues.push({
                            userId: user._id.toString(),
                            email: user.email,
                            issue: 'HOTMART_DATA_MISSING_IN_USER',
                            details: {
                                userProduct: up._id,
                                productCode: 'OGI'
                            }
                        });
                    }
                }
                if (product && product.code === 'CLAREZA') {
                    // Verificar se user.curseduca tem os mesmos dados
                    if (!user.curseduca?.email) {
                        consistencyIssues++;
                        issues.push({
                            userId: user._id.toString(),
                            email: user.email,
                            issue: 'CURSEDUCA_DATA_MISSING_IN_USER',
                            details: {
                                userProduct: up._id,
                                productCode: 'CLAREZA'
                            }
                        });
                    }
                }
                consistencyOk++;
            }
            console.log('\n📊 RESULTADOS FASE 2:');
            console.log(`Consistência OK: ${consistencyOk}`);
            console.log(`Consistência com issues: ${consistencyIssues}`);
        }
        // 3. Relatório Final
        console.log('\n' + '='.repeat(70));
        console.log('\n📋 RELATÓRIO FINAL:\n');
        if (issues.length === 0) {
            console.log('✅ TUDO OK! Nenhum issue encontrado.');
        }
        else {
            console.log(`❌ ${issues.length} ISSUES ENCONTRADOS:\n`);
            const issuesByType = issues.reduce((acc, issue) => {
                acc[issue.issue] = (acc[issue.issue] || 0) + 1;
                return acc;
            }, {});
            console.log('Breakdown por tipo:');
            Object.entries(issuesByType).forEach(([type, count]) => {
                console.log(`  - ${type}: ${count}`);
            });
            console.log('\nPrimeiros 10 issues detalhados:');
            issues.slice(0, 10).forEach((issue, idx) => {
                console.log(`\n${idx + 1}. ${issue.issue}`);
                console.log(`   User: ${issue.email} (${issue.userId})`);
                console.log(`   Details:`, JSON.stringify(issue.details, null, 2));
            });
            // Salvar relatório completo
            const fs = require('fs');
            const reportPath = 'scripts/diagnostics/segregation-issues-report.json';
            fs.writeFileSync(reportPath, JSON.stringify(issues, null, 2));
            console.log(`\n📄 Relatório completo salvo em: ${reportPath}`);
        }
        console.log('\n' + '='.repeat(70));
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
verifyDataSegregation();
