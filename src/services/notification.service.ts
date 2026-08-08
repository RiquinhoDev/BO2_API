// =====================================================
// 📁 src/services/notification.service.ts
// Serviço de notificações (Slack, Email, etc)
// =====================================================

import axios from 'axios'

import { getSlackWebhookUrl } from './requestDrivenRuntimeConfig'
class NotificationService {
  /**
   * Enviar alerta para Slack
   */
  async sendSlackAlert(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    const slackWebhookUrl = getSlackWebhookUrl()
    if (!slackWebhookUrl) {
      console.warn('⚠️  Slack webhook não configurado')
      return
    }

    const colors = {
      info: 'good',
      warning: 'warning',
      error: 'danger'
    }

    try {
      await axios.post(slackWebhookUrl, {
        attachments: [{
          color: colors[level],
          text: message,
          footer: 'Active Campaign System',
          ts: Math.floor(Date.now() / 1000)
        }]
      })

      console.log(`✅ Alerta enviado para Slack: ${message}`)
    } catch (error) {
      console.error('❌ Erro ao enviar alerta para Slack:', error)
    }
  }

  /**
   * Enviar email de alerta
   */
  async sendEmailAlert(subject: string, body: string) {
    // TODO: Implementar com nodemailer ou serviço de email
    console.log(`📧 Email Alert: ${subject}`)
    console.log(body)
  }

  /**
   * Alertas específicos
   */
  async alertHighMemoryUsage(usagePercent: number) {
    await this.sendSlackAlert(
      `🚨 *Alerta: Memória Alta*\n` +
      `Uso de memória: ${usagePercent.toFixed(1)}%\n` +
      `Limite: 80%`,
      'error'
    )
  }

  async alertCronFailure(jobName: string, error: string) {
    await this.sendSlackAlert(
      `⚠️  *Alerta: CRON Falhou*\n` +
      `Job: ${jobName}\n` +
      `Erro: ${error}`,
      'warning'
    )
  }

  async alertDeploySuccess(version: string) {
    await this.sendSlackAlert(
      `✅ *Deploy Bem-Sucedido*\n` +
      `Versão: ${version}\n` +
      `Ambiente: production`,
      'info'
    )
  }

  async alertHighCPUUsage(usage: number) {
    await this.sendSlackAlert(
      `🚨 *Alerta: CPU Alta*\n` +
      `Uso de CPU: ${usage.toFixed(1)}%\n` +
      `Limite: 90%`,
      'error'
    )
  }
}

export default new NotificationService()
