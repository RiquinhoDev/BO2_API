// src/types/guru.types.ts - Tipos para integração Guru

// ═══════════════════════════════════════════════════════════
// ESTADOS DE SUBSCRIÇÃO
// ═══════════════════════════════════════════════════════════

/**
 * Estados oficiais de subscrição Guru
 * Documentação: https://digitalmanager.guru/docs/api
 */
export type GuruSubscriptionStatus =
  | 'active'      // Subscrição ativa e em dia
  | 'pastdue'     // Pagamento em atraso (ainda pode ter acesso)
  | 'canceled'    // Cancelada pelo utilizador/sistema
  | 'expired'     // Expirada (fim do período)
  | 'pending'     // Aguardando confirmação de pagamento
  | 'refunded'    // Reembolsada
  | 'suspended'   // Suspensa temporariamente

// Estados que permitem SSO (acesso ao MyOrders)
export const GURU_SSO_ALLOWED_STATUSES: GuruSubscriptionStatus[] = [
  'active',
  'pastdue'
]

// ═══════════════════════════════════════════════════════════
// PAYLOAD DO WEBHOOK
// ═══════════════════════════════════════════════════════════

/**
 * Payload recebido no webhook da Guru
 */
export interface GuruWebhookPayload {
  // Autenticação
  api_token: string

  // Identificação do evento
  event: GuruWebhookEvent

  // Dados da subscrição
  subscription_code: string
  guru_contact_id: string
  status: GuruSubscriptionStatus

  // Dados do produto/oferta
  offer_id?: string
  product_id?: string

  // Datas
  updated_at: string
  next_cycle_at?: string

  // Dados do contacto
  email: string
  name?: string
  phone?: string
  document?: string

  // Dados financeiros
  value?: number
  currency?: string

  // URL para regularizar pagamento
  payment_url?: string
}

/**
 * Tipos de eventos de webhook
 */
export type GuruWebhookEvent =
  | 'subscription.created'
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'subscription.expired'
  | 'subscription.pastdue'
  | 'subscription.refunded'
  | 'subscription.suspended'
  | 'subscription.updated'
  | 'payment.approved'
  | 'payment.refused'
  | 'payment.refunded'
  | 'payment.chargeback'

// ═══════════════════════════════════════════════════════════
// DADOS GUARDADOS NA BD
// ═══════════════════════════════════════════════════════════

/**
 * Dados da subscrição Guru guardados no User
 */
export interface GuruUserData {
  // Identificadores
  guruContactId: string
  subscriptionCode: string

  // Status e datas
  status: GuruSubscriptionStatus
  updatedAt: Date
  nextCycleAt?: Date

  // Produto/Oferta
  offerId?: string
  productId?: string

  // Pagamento
  paymentUrl?: string

  // Metadados
  lastSyncAt: Date
  syncVersion: string
  lastWebhookAt?: Date
}

/**
 * Documento do webhook guardado na BD
 */
export interface GuruWebhookDocument {
  requestId: string
  subscriptionCode: string
  email: string
  event: GuruWebhookEvent
  status: GuruSubscriptionStatus
  receivedAt: Date
  processed: boolean
  processedAt?: Date
  rawData: GuruWebhookPayload
  error?: string
}

// ═══════════════════════════════════════════════════════════
// SSO
// ═══════════════════════════════════════════════════════════

/**
 * Resposta da API de SSO da Guru
 */
export interface GuruSSOResponse {
  url: string
  expires_at?: string
}

/**
 * Resultado da verificação de status
 */
export interface GuruStatusCheckResult {
  hasSubscription: boolean
  email: string
  name?: string
  subscription?: {
    status: GuruSubscriptionStatus
    subscriptionCode: string
    productId?: string
    nextCycleAt?: Date
    updatedAt?: Date
  }
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════

/**
 * Estatísticas do dashboard Guru
 */
export interface GuruDashboardStats {
  totalSubscriptions: number
  byStatus: {
    active: number
    pastdue: number
    canceled: number
    expired: number
    pending: number
    refunded: number
    suspended: number
  }
  webhooks: {
    total: number
    today: number
    processed: number
    failed: number
  }
  lastWebhookAt?: Date
}

// ═══════════════════════════════════════════════════════════
// LOGS SSO
// ═══════════════════════════════════════════════════════════

/**
 * Log de tentativa de SSO
 */
export interface GuruSSOLog {
  email: string
  timestamp: Date
  success: boolean
  subscriptionCode?: string
  error?: string
  redirectUrl?: string
}
