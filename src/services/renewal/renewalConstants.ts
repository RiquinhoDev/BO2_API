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

// ── Família de produtos OGI ──────────────────────────────────────────
// A sync do histórico por aluno guardava só o produto principal (1733154),
// pelo que a Renovação de 97€ (3100292) nunca aparecia na ficha — logo a
// compra dupla no mesmo dia, que é o que dá os 2 anos de acesso, ficava
// invisível. O 4346330 é o pacote OGI+OTF.
//
// Nota: isto NÃO altera o produto usado como chave do documento nem os
// agregados mensais — serve só para decidir que vendas entram no histórico
// de cada aluno.
export const OGI_PRODUCT_FAMILY_IDS: string[] = (
  process.env.HOTMART_OGI_PRODUCT_FAMILY_IDS?.split(',').map((s) => s.trim()).filter(Boolean) ?? [
    '1733154', // O Grande Investimento
    '3100292', // OGI - Renovação (97€)
    '4346330'  // OGI + OTF (pacote)
  ]
)

// ── Estados varridos na consulta por email ───────────────────────────
// Com buyer_email e SEM transaction_status a Hotmart devolve apenas
// COMPLETE e APPROVED — ou seja, só quem pagou. Um histórico honesto tem
// de mostrar também os reembolsos e os incumprimentos, porque são eles que
// decidem se a pessoa mantém acesso. Cada estado é uma chamada a mais por
// aluno, por isso a lista é curta e só tem o que muda decisões.
//
// A entrada `null` é a chamada sem filtro (COMPLETE + APPROVED).
export const HOTMART_PER_EMAIL_STATUS_SWEEP: Array<string | null> = [
  null,
  'REFUNDED',
  'CHARGEBACK',
  'OVERDUE'
]
