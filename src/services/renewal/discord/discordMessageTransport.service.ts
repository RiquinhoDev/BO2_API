import { createHash } from 'node:crypto'
import axios from 'axios'

import {
  DiscordMessageLog,
} from '../../../models/discordRenewal'
import {
  ActiveCampaignExecutionOwnershipError,
} from '../../activeCampaign/activeCampaignExecution.service'
import type { DiscordMessageExecutionContext } from './discordMessageExecution.service'
import {
  ALL_RENEWAL_ROLE_IDS,
  botHeaders,
  configuredBotUrl,
  getDefaultMessageChannelId,
  getMessageChannels,
  isMessagesEnabled,
  ROLE_NAME_BY_ID,
} from './planning'

interface DiscordMessageResponse {
  messageIds?: string[]
  parts?: number
}

export interface DiscordMessageSendParams {
  content: string
  mentionRoleIds: string[]
  dataFim?: string
  channelId?: string
  templateKey?: string
  mentionEveryone?: boolean
  sentBy: string
}

export type DiscordMessageSendResult = {
  success: boolean
  message: string
  messageIds?: string[]
  kind?: 'in-progress' | 'indeterminate' | 'request-id-reused'
}

export interface PreparedDiscordMessage {
  channelId: string
  content: string
  mentionRoleIds: string[]
  mentionRoleNames: string[]
  mentionEveryone: boolean
  templateKey?: string
  sentBy: string
  url: string
  headers: Record<string, string>
}

type PreparedDiscordMessageResult =
  | { success: true; message: PreparedDiscordMessage }
  | { success: false; message: string }

export function renderMessage(
  content: string,
  mentionRoleIds: string[],
  dataFim?: string,
  mentionEveryone: boolean = false,
): string {
  const mentions = mentionRoleIds.map((id) => `<@&${id}>`).join(' ')
  const hadCargosPlaceholder = /\{cargos\}/.test(content)

  let out = content
    .replace(/\{cargos\}/g, mentions || '')
    .replace(/\{dataFim\}/g, dataFim || '{dataFim}')

  const header: string[] = []
  if (mentionEveryone && !/@everyone/.test(out)) header.push('@everyone')
  if (mentions && !hadCargosPlaceholder) header.push(mentions)
  if (header.length > 0) out = `${header.join(' ')}\n\n${out}`

  return out
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const responseMessage = (error: unknown): string | undefined => {
  if (!axios.isAxiosError(error)) return undefined
  const data: unknown = error.response?.data
  if (typeof data !== 'object' || data === null || !('message' in data)) return undefined
  return typeof data.message === 'string' ? data.message : undefined
}

export function prepareDiscordMessage(
  params: DiscordMessageSendParams,
): PreparedDiscordMessageResult {
  if (!isMessagesEnabled()) {
    return { success: false, message: 'DISCORD_MESSAGES_ENABLED != true — envio recusado (nada publicado)' }
  }

  const roleIds = params.mentionRoleIds.filter((id) => ALL_RENEWAL_ROLE_IDS.includes(id))
  if (roleIds.length !== params.mentionRoleIds.length) {
    return { success: false, message: 'mentionRoleIds contém cargos fora da allowlist R.*' }
  }

  const channelId = params.channelId || getDefaultMessageChannelId()
  if (!channelId) return { success: false, message: 'DISCORD_MESSAGE_CHANNEL_ID not configured' }
  const allowedChannels = getMessageChannels()
  if (!allowedChannels.some((channel) => channel.channelId === channelId)) {
    return { success: false, message: 'Canal fora da lista de canais permitidos (DISCORD_MESSAGE_CHANNELS)' }
  }

  const mentionEveryone = params.mentionEveryone === true
  const finalContent = renderMessage(params.content, roleIds, params.dataFim, mentionEveryone)
  if (!finalContent.trim()) return { success: false, message: 'Mensagem vazia' }

  const url = configuredBotUrl()
  if (!url) return { success: false, message: 'Bot recusou/falhou: Integration unavailable' }
  let headers: Record<string, string>
  try {
    headers = botHeaders()
  } catch {
    return { success: false, message: 'Bot recusou/falhou: Integration unavailable' }
  }

  return {
    success: true,
    message: {
      channelId,
      content: finalContent,
      mentionRoleIds: roleIds,
      mentionRoleNames: [
        ...(mentionEveryone ? ['@everyone'] : []),
        ...roleIds.map((id) => ROLE_NAME_BY_ID.get(id) || id),
      ],
      mentionEveryone,
      templateKey: params.templateKey,
      sentBy: params.sentBy,
      url,
      headers,
    },
  }
}

export function normalizeDiscordActor(sentBy: string): string {
  return sentBy.trim().toLowerCase()
}

export function discordMessageIdentity(params: DiscordMessageSendParams): string {
  return createHash('sha256').update(JSON.stringify({
    content: params.content,
    mentionRoleIds: params.mentionRoleIds,
    dataFim: params.dataFim ?? null,
    channelId: params.channelId ?? null,
    templateKey: params.templateKey ?? null,
    mentionEveryone: params.mentionEveryone === true,
    sentBy: normalizeDiscordActor(params.sentBy),
  })).digest('hex')
}

export async function performDiscordMessage(
  message: PreparedDiscordMessage,
  context?: DiscordMessageExecutionContext,
  afterProviderSuccess?: (context: DiscordMessageExecutionContext) => Promise<void>,
): Promise<DiscordMessageSendResult> {
  let resp: { data: DiscordMessageResponse }
  try {
    context?.lease.assertOwnership()
    context?.provider.begin()
    resp = await axios.post<DiscordMessageResponse>(
      `${message.url}/renewal/messages/send`,
      {
        channelId: message.channelId,
        content: message.content,
        mentionRoleIds: message.mentionRoleIds,
        mentionEveryone: message.mentionEveryone,
      },
      { headers: message.headers, timeout: 60000 },
    )
  } catch (error: unknown) {
    if (context && error instanceof ActiveCampaignExecutionOwnershipError) throw error
    return { success: false, message: `Bot recusou/falhou: ${responseMessage(error) || errorMessage(error)}` }
  }

  context?.provider.success()
  try {
    await DiscordMessageLog.create({
      channelId: message.channelId,
      content: message.content,
      mentionRoleIds: message.mentionRoleIds,
      mentionRoleNames: message.mentionRoleNames,
      templateKey: message.templateKey,
      sentBy: message.sentBy,
      messageIds: resp.data.messageIds || [],
      parts: resp.data.parts || 1,
      sentAt: new Date(),
    })
    if (context && afterProviderSuccess) await afterProviderSuccess(context)
  } catch (error: unknown) {
    if (context) throw error
    return { success: false, message: `Bot recusou/falhou: ${responseMessage(error) || errorMessage(error)}` }
  }

  return { success: true, message: `Publicada (${resp.data.parts || 1} parte(s))`, messageIds: resp.data.messageIds }
}
