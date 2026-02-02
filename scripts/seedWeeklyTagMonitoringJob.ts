// ════════════════════════════════════════════════════════════
// 📁 scripts/seedWeeklyTagMonitoringJob.ts
// Script: Criar Job Semanal de Monitorização de Tags Nativas
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { WeeklyTagMonitoringConfig } from '../src/models/tagMonitoring'

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env') })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/riquinho'

/**
 * Cria a configuração inicial do sistema de monitorização
 */
async function seedWeeklyTagMonitoringJob() {
  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('🚀 Inicializando Sistema de Monitorização Semanal de Tags')
    console.log('═══════════════════════════════════════════════════════════\n')

    // Conectar à BD
    console.log('📡 Conectando à base de dados...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Conectado à MongoDB!\n')

    // Verificar se já existe configuração
    const existingConfig = await WeeklyTagMonitoringConfig.findOne()

    if (existingConfig) {
      console.log('⚠️  Configuração já existe:')
      console.log(`   Scope: ${existingConfig.scope}`)
      console.log(`   Enabled: ${existingConfig.enabled}`)
      console.log(`   Criada em: ${existingConfig.createdAt}`)
      console.log(`   Atualizada em: ${existingConfig.updatedAt}\n`)

      console.log('ℹ️  Para atualizar, use os endpoints da API:')
      console.log('   PATCH /api/tag-monitoring/config/scope')
      console.log('   PATCH /api/tag-monitoring/config/toggle\n')

      return existingConfig
    }

    // Criar configuração inicial
    console.log('📝 Criando configuração inicial...')

    const config = await WeeklyTagMonitoringConfig.create({
      scope: 'STUDENTS_ONLY', // Modo conservador por default
      enabled: true,
    })

    console.log('✅ Configuração criada com sucesso!\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('📊 CONFIGURAÇÃO CRIADA')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`ID: ${config._id}`)
    console.log(`Scope: ${config.scope}`)
    console.log(`Enabled: ${config.enabled}`)
    console.log(`Created At: ${config.createdAt}`)
    console.log('═══════════════════════════════════════════════════════════\n')

    console.log('📋 PRÓXIMOS PASSOS:')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('1. ✅ Configuração criada (STUDENTS_ONLY, habilitado)')
    console.log('2. 🏷️  Marcar tags críticas via dashboard:')
    console.log('      POST /api/tag-monitoring/critical-tags')
    console.log('3. 📸 Executar snapshot manual (opcional):')
    console.log('      POST /api/tag-monitoring/snapshots/manual')
    console.log('4. ⏰ O snapshot semanal automático irá executar:')
    console.log('      - Domingo às 02:00 (Europe/Lisbon)')
    console.log('      - Via CRON job no servidor')
    console.log('5. 🔔 Ver notificações no dashboard:')
    console.log('      GET /api/tag-monitoring/notifications')
    console.log('═══════════════════════════════════════════════════════════\n')

    console.log('ℹ️  INFORMAÇÃO ADICIONAL:')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('STUDENTS_ONLY:')
    console.log('  • Apenas alunos com produtos na BD')
    console.log('  • ~5.000 contactos')
    console.log('  • Duração estimada: ~12 minutos')
    console.log('  • Espaço (6 meses): ~45 MB')
    console.log('')
    console.log('ALL_CONTACTS (avançado):')
    console.log('  • Todos os contactos da ActiveCampaign')
    console.log('  • ~50.000 contactos (inclui leads)')
    console.log('  • Duração estimada: ~2 horas')
    console.log('  • Espaço (6 meses): ~445 MB')
    console.log('  • Para ativar: PATCH /api/tag-monitoring/config/scope')
    console.log('    Body: { "scope": "ALL_CONTACTS" }')
    console.log('═══════════════════════════════════════════════════════════\n')

    return config
  } catch (error: any) {
    console.error('❌ Erro ao criar configuração:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('👋 Desconectado da MongoDB')
  }
}

// Executar script
seedWeeklyTagMonitoringJob()
  .then(() => {
    console.log('\n✅ Script concluído com sucesso!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script falhou:', error)
    process.exit(1)
  })
