// Raiz de composição do domínio de renovações e vendas.
//
// Os serviços de renovação, o histórico de vendas Hotmart e a estimativa de
// câmbio chegaram do main a ler `process.env` espalhado pelo código. A regra
// desta base é que a leitura crua do ambiente vive num sítio revisto, não no
// meio da lógica: quem quiser saber que variáveis existem lê este ficheiro.
//
// Os valores são lidos uma vez, no arranque, e os defaults são exactamente os
// que vinham no código de origem — isto é uma mudança de sítio, não de
// comportamento.

const trimmed = (value: string | undefined): string | undefined => {
  const text = value?.trim()
  return text ? text : undefined
}

const numberOr = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed !== 0 ? parsed : fallback
}

/** Produtos Clareza na Guru, para a performance de vendas por produto. */
export const GURU_CLAREZA_PRODUCT_IDS = Object.freeze({
  CLAREZA_MENSAL: trimmed(process.env.GURU_CLAREZA_MENSAL_PRODUCT_ID) ?? '9fa25a47-34d8-41ef-b684-0285e1c33aa4',
  CLAREZA_ANUAL: trimmed(process.env.GURU_CLAREZA_ANUAL_PRODUCT_ID) ?? 'a002b78e-82cb-48a6-8d5d-33c8bded3d2e',
})

/** Ids dos custom fields da ActiveCampaign usados pelo domínio de renovações. */
export const AC_RENEWAL_FIELD_IDS = Object.freeze({
  purchaseDate: numberOr(process.env.AC_PURCHASE_DATE_FIELD_ID, 334),
  firstPurchaseDate: numberOr(process.env.AC_FIRST_PURCHASE_DATE_FIELD_ID, 337),
  expirationDate: numberOr(process.env.RENEWAL_AC_EXPIRY_FIELD_ID, 332),
  purchaseStatus: numberOr(process.env.AC_PURCHASE_STATUS_FIELD_ID, 282),
  refundDate: numberOr(process.env.AC_REFUND_DATE_FIELD_ID, 324),
})

/**
 * Valor configurado para o campo de data de compra, tal como veio do ambiente e
 * sem default. A reconciliação recusa-se a correr contra um campo diferente do
 * esperado, por isso precisa de distinguir "não configurado" de "configurado
 * com outro valor".
 *
 * É lido a cada chamada, e não uma vez no arranque como o resto deste ficheiro:
 * a guarda existe para falhar fechado quando alguém aponta o reconciliador ao
 * campo errado, e isso tem de valer também para quem muda a variável com o
 * processo já a correr.
 */
export function readAcPurchaseDateFieldId(): string | undefined {
  return process.env.AC_PURCHASE_DATE_FIELD_ID
}

/** Produto OGI na Hotmart: o ambiente ganha à resolução pela base de dados. */
export const HOTMART_OGI_PRODUCT_ID = trimmed(process.env.HOTMART_OGI_PRODUCT_ID)

/** Família de produtos OGI que entra no histórico de vendas de cada aluno. */
export const HOTMART_OGI_PRODUCT_FAMILY_IDS: readonly string[] = Object.freeze(
  process.env.HOTMART_OGI_PRODUCT_FAMILY_IDS?.split(',').map((id) => id.trim()).filter(Boolean) ?? [
    '1733154', // O Grande Investimento
    '3100292', // OGI - Renovação (97€)
    '4346330', // OGI + OTF (pacote)
  ],
)

/** Preço acima do qual uma venda OGI conta como aluno novo, em euros. */
export const OGI_NEW_STUDENT_PRICE_THRESHOLD_EUR = numberOr(
  process.env.OGI_NEW_STUDENT_PRICE_THRESHOLD_EUR,
  167,
)

/** Câmbios para euro, aproximados e revistos à mão. */
export const FX_RATES_TO_EUR: Readonly<Record<string, number>> = Object.freeze({
  USD: numberOr(process.env.FX_RATE_USD_EUR, 0.92),
  GBP: numberOr(process.env.FX_RATE_GBP_EUR, 1.17),
  CHF: numberOr(process.env.FX_RATE_CHF_EUR, 1.05),
  CAD: numberOr(process.env.FX_RATE_CAD_EUR, 0.68),
  BRL: numberOr(process.env.FX_RATE_BRL_EUR, 0.16),
})
