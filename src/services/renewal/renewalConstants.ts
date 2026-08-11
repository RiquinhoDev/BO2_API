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
