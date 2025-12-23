// ════════════════════════════════════════════════════════════════════════════
// 🔍 SCRIPT DE VERIFICAÇÃO - Dados no Histórico
// ════════════════════════════════════════════════════════════════════════════
// Executar: npx ts-node outputs/check-history-data.ts

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config()

async function checkHistoryData() {
  try {
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('🔍 VERIFICAÇÃO - Dados no CommunicationHistory')
    console.log('════════════════════════════════════════════════════════════\n')

    await mongoose.connect(process.env.MONGODB_URI || "mongodb+srv://desenvolvimentoserriquinho:t0EDr0lbR91mqf2P@clusterriquinho.djt0j.mongodb.net/riquinho?retryWrites=true&w=majority&tls=true")
    console.log('✅ Conectado\n')

    const CommunicationHistory = (await import('../src/models/acTags/CommunicationHistory')).default
    const CronExecutionLog = (await import('../src/models/CronExecutionLog')).default

    // ═══════════════════════════════════════════════════════════
    // 1. VERIFICAR COMMUNICATION HISTORY
    // ═══════════════════════════════════════════════════════════
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 COMMUNICATION HISTORY')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const totalHistory = await CommunicationHistory.countDocuments()
    console.log(`Total de registos: ${totalHistory}`)

    if (totalHistory > 0) {
      // Por ação
      const byAction = await CommunicationHistory.aggregate([
        {
          $group: {
            _id: '$action',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])

      console.log('\n📋 Por Tipo de Ação:')
      byAction.forEach((a: any) => {
        console.log(`   ${a._id}: ${a.count}`)
      })

      // Por fonte
      const bySource = await CommunicationHistory.aggregate([
        {
          $group: {
            _id: '$source',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ])

      console.log('\n📡 Por Fonte:')
      bySource.forEach((s: any) => {
        console.log(`   ${s._id}: ${s.count}`)
      })

      // Últimas 5 ações
      const latest = await CommunicationHistory.find()
        .sort({ timestamp: -1 })
        .limit(5)
        .populate('userId', 'name email')
        .populate('courseId', 'name code')
        .lean()

      console.log('\n🕐 Últimas 5 Ações:')
      latest.forEach((h: any) => {
        const user = h.userId as any
        const course = h.courseId as any
        console.log(`   ${h.timestamp.toISOString()} | ${h.action} | ${h.tagName}`)
        console.log(`      User: ${user?.name || 'N/A'} | Course: ${course?.name || 'N/A'}`)
      })

      // Período
      const oldest = await CommunicationHistory.findOne().sort({ timestamp: 1 })
      const newest = await CommunicationHistory.findOne().sort({ timestamp: -1 })

      console.log('\n📅 Período dos Dados:')
      console.log(`   Mais antigo: ${oldest?.timestamp.toISOString()}`)
      console.log(`   Mais recente: ${newest?.timestamp.toISOString()}`)

    } else {
      console.log('\n⚠️  Nenhum registo encontrado!')
      console.log('   Possíveis razões:')
      console.log('   1. CRON ainda não foi executado')
      console.log('   2. TagRuleEngine não está a criar registos')
      console.log('   3. Nenhuma regra foi aplicada ainda')
    }

    // ═══════════════════════════════════════════════════════════
    // 2. VERIFICAR CRON EXECUTION LOG
    // ═══════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📊 CRON EXECUTION LOG')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    const totalExecutions = await CronExecutionLog.countDocuments()
    console.log(`Total de execuções: ${totalExecutions}`)

    if (totalExecutions > 0) {
      // Últimas 5 execuções
      const latestExecs = await CronExecutionLog.find()
        .sort({ startedAt: -1 })
        .limit(5)
        .lean()

      console.log('\n🕐 Últimas 5 Execuções:')
      latestExecs.forEach((e: any) => {
        const duration = e.duration ? `${(e.duration / 1000).toFixed(1)}s` : 'N/A'
        const status = e.status === 'success' ? '✅' : '❌'
        
        console.log(`\n   ${status} ${e.executionId}`)
        console.log(`      Início: ${e.startedAt.toISOString()}`)
        console.log(`      Duração: ${duration}`)
        console.log(`      Status: ${e.status}`)
        
        if (e.results) {
          console.log(`      Alunos processados: ${e.results.totalStudents || 0}`)
          console.log(`      Tags aplicadas: ${e.results.tagsApplied || 0}`)
          console.log(`      Tags removidas: ${e.results.tagsRemoved || 0}`)
          
          if (e.results.errors?.length > 0) {
            console.log(`      ⚠️  Erros: ${e.results.errors.length}`)
          }
        }
      })

      // Estatísticas gerais
      const successfulExecs = await CronExecutionLog.countDocuments({ status: 'success' })
      const failedExecs = await CronExecutionLog.countDocuments({ status: 'failed' })

      console.log('\n📊 Estatísticas Gerais:')
      console.log(`   Total: ${totalExecutions}`)
      console.log(`   Sucessos: ${successfulExecs}`)
      console.log(`   Falhas: ${failedExecs}`)
      console.log(`   Taxa de sucesso: ${((successfulExecs / totalExecutions) * 100).toFixed(1)}%`)

    } else {
      console.log('\n⚠️  Nenhuma execução registada!')
      console.log('   O CRON ainda não foi executado.')
    }

    // ═══════════════════════════════════════════════════════════
    // 3. CONCLUSÃO
    // ═══════════════════════════════════════════════════════════
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 CONCLUSÃO')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    if (totalHistory > 0 && totalExecutions > 0) {
      console.log('✅ Sistema está funcional!')
      console.log('   Os endpoints de histórico terão dados para mostrar.')
      console.log('\n📝 Próximos passos:')
      console.log('   1. Testar endpoint: GET /api/activecampaign/communication-history')
      console.log('   2. Testar endpoint: GET /api/activecampaign/history/stats')
      console.log('   3. Implementar frontend')
    } else if (totalExecutions > 0 && totalHistory === 0) {
      console.log('⚠️  CRON foi executado mas não há registos de comunicações!')
      console.log('   Possíveis problemas:')
      console.log('   1. TagRuleEngine não está a criar registos em CommunicationHistory')
      console.log('   2. Nenhuma regra foi aplicada (todos os alunos já têm as tags certas)')
      console.log('\n📝 Próximos passos:')
      console.log('   1. Verificar código do TagRuleEngine')
      console.log('   2. Executar CRON manual: POST /api/activecampaign/test-cron')
      console.log('   3. Verificar logs do backend')
    } else {
      console.log('⚠️  Sistema ainda não foi executado!')
      console.log('\n📝 Próximos passos:')
      console.log('   1. Executar CRON manual: POST /api/activecampaign/test-cron')
      console.log('   2. Aguardar próxima execução automática (2h da manhã)')
      console.log('   3. Verificar se CommunicationHistory foi preenchido')
    }

    console.log('\n════════════════════════════════════════════════════════════\n')

  } catch (error: any) {
    console.error('\n❌ ERRO:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('📡 Desconectado\n')
  }
}

checkHistoryData()