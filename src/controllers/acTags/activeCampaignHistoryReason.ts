import type { Types } from 'mongoose'
import type { IUserStateSnapshot } from '../../models/acTags/CommunicationHistory'

export type CommunicationReasonRule = {
  _id: Types.ObjectId
  name?: string
  category?: string
}

type CommunicationReasonRecord = {
  userStateSnapshot?: IUserStateSnapshot
}

export function buildReason(
  record: CommunicationReasonRecord,
  rule?: CommunicationReasonRule
): string {
  // Se tiver snapshot, usar para criar reason descritivo
  const snapshot = record.userStateSnapshot

  if (!snapshot) {
    return rule?.name || 'Regra aplicada automaticamente'
  }

  const parts: string[] = []

  // Adicionar informação de inatividade
  if (snapshot.daysSinceLastLogin != null) {
    parts.push(`${snapshot.daysSinceLastLogin} dias sem login`)
  } else if (snapshot.daysSinceLastAction != null) {
    parts.push(`${snapshot.daysSinceLastAction} dias inativo`)
  }

  // Adicionar progresso
  if (snapshot.currentProgress !== undefined) {
    parts.push(`progresso ${snapshot.currentProgress}%`)
  }

  // Se tiver nome da regra, adicionar
  if (rule?.name) {
    parts.push(`(${rule.name})`)
  }

  return parts.length > 0
    ? parts.join(', ')
    : 'Regra aplicada automaticamente'
}
