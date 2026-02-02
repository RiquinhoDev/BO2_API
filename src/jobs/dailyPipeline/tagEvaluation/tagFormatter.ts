// ════════════════════════════════════════════════════════════
// 🏷️ TAG FORMATTER
// Formata tags com prefixo BO_ (camada 4 de proteção)
// ════════════════════════════════════════════════════════════

import { ProductName } from './types'

/**
 * 🛡️ CAMADA 4 DE PROTEÇÃO: Adiciona prefixo BO_ a TODAS as tags
 *
 * Formato final: "BO_PRODUCTNAME - Descrição"
 *
 * Exemplos:
 *   formatBOTag('OGI_V1', 'Inativo 14d') → "BO_OGI_V1 - Inativo 14d"
 *   formatBOTag('CLAREZA_ANUAL', 'Alto Engajamento') → "BO_CLAREZA_ANUAL - Alto Engajamento"
 *
 * Isto torna a identificação de tags BO 100% infalível!
 */
export function formatBOTag(productName: ProductName, description: string): string {
  return `BO_${productName} - ${description}`
}

/**
 * Remove o prefixo BO_ de uma tag (para display)
 */
export function removeBOPrefix(tag: string): string {
  if (tag.startsWith('BO_')) {
    return tag.substring(3) // Remove "BO_"
  }
  return tag
}

/**
 * Verifica se uma tag tem o prefixo BO_
 */
export function hasBOPrefix(tag: string): boolean {
  return tag.startsWith('BO_')
}
