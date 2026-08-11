// Oferta generica de renovacao = link por defeito para todas as turmas sem
// oferta especial atribuida.
export const GENERIC_RENEWAL_OFFER_CODE = '1cp00emj'
export const GENERIC_RENEWAL_OFFER_NAME = 'Renovação turma genérica'

// Turmas 1 e 2 são as duas turmas originais (preço diferente, fixo para
// sempre) — têm sempre o mesmo link de renovação, independentemente de
// quantas vezes já renovaram (o nome da turma muda a cada ciclo: "Turma 1
// [4ª renov] | 2601" → "[5ª renov] | 2701" → ...; o offer code NUNCA muda).
// Fixo em código de propósito — não depende de ninguém manter isto
// atualizado no Backoffice.
export const TURMA_1_RENEWAL_OFFER_CODE = 'm0ztdyti'
export const TURMA_2_RENEWAL_OFFER_CODE = 'dyeiu7m9'

// A Hotmart, sem start_date, só devolve uma janela recente (~30 dias) —
// qualquer sync de sales/history sem isto nunca descobre ofertas sem
// venda recente (foi assim que TURMA_1/2_RENEWAL_OFFER_CODE ficaram por
// criar na BD durante meses). start_date tem limite de recuo próprio:
// confirmado empiricamente contra a API real que 730 dias (2 anos) passa
// e 731 já dá 400 invalid_parameter — limite da própria Hotmart.
export const HOTMART_SALES_HISTORY_MAX_LOOKBACK_DAYS = 730
