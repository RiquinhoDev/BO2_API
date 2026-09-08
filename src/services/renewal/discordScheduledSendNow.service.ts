import { DiscordScheduledRule, DiscordMessageTemplate, DiscordRoleState } from '../../models/discordRenewal'
import { getTargetMonth, isScheduledMessagesEnabled } from './discordScheduledMessages.service'
import { sendDiscordMessage } from './discordRolesSync.service'

/** Manual recovery uses the same rule/month receipt as cron, bypassing only the calendar day. */
export async function sendScheduledRuleNow(key: string, sentBy: string, options: { dryRun?: boolean } = {}) {
  if (!isScheduledMessagesEnabled()) return { success: false, message: 'DISCORD_SCHEDULED_MESSAGES_ENABLED != true — envio recusado' }
  const rule = await DiscordScheduledRule.findOne({ key }).exec()
  if (!rule) return { success: false, message: 'Regra não encontrada' }
  if (!rule.enabled) return { success: false, message: 'Regra desligada' }
  const now = new Date()
  const target = getTargetMonth(now)
  if (rule.lastSentMonth === target.monthKey) return { success: false, message: `Já enviada este mês (${target.monthKey})` }
  const members = await DiscordRoleState.countDocuments({ roleId: target.roleId })
  if (members === 0) return { success: false, message: 'Cargo sem membros — nada enviado' }
  const template = await DiscordMessageTemplate.findOne({ key: rule.templateKey }).lean().exec()
  if (!template) return { success: false, message: 'Template não encontrado' }
  const publicTarget = { roleName: target.roleName, members, dataFim: target.dataFim }
  if (options.dryRun === true) return { success: true, dryRun: true, message: 'Pré-visualização; nada enviado', target: publicTarget }
  const result = await sendDiscordMessage({
    content: template.content, mentionRoleIds: [target.roleId], dataFim: target.dataFim,
    channelId: rule.channelId || undefined, templateKey: rule.templateKey, sentBy,
  }, `cron:DiscordScheduledMessages:${rule.key}:${target.monthKey}`, {
    operation: 'scheduled-rule', identity: `rule:${rule.key}:${target.monthKey}`,
    afterProviderSuccess: async context => {
      context.lease.assertOwnership()
      rule.lastRunAt = now
      rule.lastSentMonth = target.monthKey
      rule.lastResult = `envio manual a ${target.roleName} (${members} membros)`
      await rule.save()
    },
  })
  return { ...result, target: publicTarget }
}
