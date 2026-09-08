// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acTagWatch.regras.ts
// As regras puras da vigilância de tags: o que está no escopo, o
// que é evento a sério, o que se agrupa e o que é grave.
//
// Sem mongoose e sem axios de propósito — para poderem ser
// testadas sem ligar a nada, como o `renewalTimeline.types.ts`.
// ════════════════════════════════════════════════════════════

import {
  TAGS_ESTADO_VIGIADAS,
  TAGS_OBRIGATORIAS,
  eTagEstadoVigiada,
  eTagObrigatoria
} from './tagsObrigatorias'

export type TipoTag = 'canonica' | 'membresia' | 'outra'
export type Severidade = 'grave' | 'aviso' | 'ruido'

/** Uma tag do contacto, como está no espelho. */
export interface FotoTag {
  tagId: string
  nome: string
  tipo: TipoTag
  aplicadaEm: Date | null
}

// ─────────────────────────────────────────────────────────────
// 1. O período sai do nome da tag, nunca se constrói
// ─────────────────────────────────────────────────────────────

/**
 * YYMM lido do nome da tag. Lê, não constrói — construir nomes de tag
 * é o que cria tags novas na AC, e é proibido.
 *
 * Ex.: "Aluno OGI L2409 - Turma 11" → "2409"
 *      "Aluno OGI 2505 - Renovação Turma 10 [2anos]" → "2505"
 */
export function periodoDaTag(nome: string): string | null {
  const m = String(nome).match(/aluno\s+ogi\s+l?(\d{4})\b/i)
  return m?.[1] ?? null
}

// ─────────────────────────────────────────────────────────────
// 2. O escopo
// ─────────────────────────────────────────────────────────────

/**
 * Vigia-se a tag da turma ACTUAL, as duas obrigatórias nomeadas e a
 * `Aluno OGI Antigo`. Mais nada: o espelho tem 116 tags distintas e
 * vigiar as 116 dá uma fila que ninguém lê.
 *
 * As tags de turma antigas ficam de fora por serem histórico legítimo —
 * quem está na Turma 18 tem a tag da Turma 11 de há dois anos, e isso
 * está certo.
 *
 * Compara-se por `tagId` e nunca por nome: o nome na AC pode ser
 * renomeado a qualquer momento e o id não.
 */
export function tagVigiada(
  tag: { tagId: string; nome: string; tipo: TipoTag },
  tagDaTurmaActual: string | null
): boolean {
  if (eTagObrigatoria(tag.tagId)) return true
  if (eTagEstadoVigiada(tag.tagId)) return true
  if (!tagDaTurmaActual) return false
  return (
    tag.tipo === 'membresia' &&
    String(tag.nome).toLowerCase().trim() === String(tagDaTurmaActual).toLowerCase().trim()
  )
}

// ─────────────────────────────────────────────────────────────
// 3. O diff
// ─────────────────────────────────────────────────────────────

export interface DiffTags {
  aplicadas: FotoTag[]
  removidas: FotoTag[]
}

/** Indiferente à ordem dos arrays, de propósito: já tivemos dois bugs de
 *  emparelhamento que dependiam dela. */
export function diffTags(antes: FotoTag[], depois: FotoTag[]): DiffTags {
  const idsAntes = new Set(antes.map((t) => String(t.tagId)))
  const idsDepois = new Set(depois.map((t) => String(t.tagId)))
  return {
    aplicadas: depois.filter((t) => !idsAntes.has(String(t.tagId))),
    removidas: antes.filter((t) => !idsDepois.has(String(t.tagId)))
  }
}

/**
 * Distingue "o espelho passou a ver esta tag" de "esta tag foi mesmo
 * aplicada", e a diferença é a data.
 *
 * Uma tag ausente da fotografia e presente agora tem duas explicações
 * opostas. Assumir que a ausência basta esconde exactamente os eventos
 * que interessam: foi assim que 36 aplicações reais da `Aluno OGI Antigo`
 * feitas na manhã de 30/08/2026 quase passaram despercebidas.
 */
export function soAgoraVisivel(
  tag: FotoTag,
  idsNaFotografia: Set<string>,
  fotografiaEm: Date | null
): boolean {
  if (idsNaFotografia.has(String(tag.tagId))) return false
  if (!tag.aplicadaEm || !fotografiaEm) return true
  return tag.aplicadaEm.getTime() <= fotografiaEm.getTime()
}

// ─────────────────────────────────────────────────────────────
// 4. Os lotes
// ─────────────────────────────────────────────────────────────

/** Segundos de silêncio que separam duas rajadas da mesma tag. */
export const JANELA_LOTE_SEGUNDOS = 120
/** A partir de quantos eventos próximos se assume automação. */
export const LIMIAR_LOTE = 10

export interface EventoAgrupavel {
  tagId: string
  quando: Date | null
  accao: 'aplicada' | 'removida'
}

export interface Lote {
  chave: string
  tamanho: number
}

/**
 * Agrupa por PROXIMIDADE, não por balde de relógio.
 *
 * Um balde ao minuto parte uma rajada que atravesse a fronteira: a
 * automação de 30/08/2026 correu das 08:04:55 às 08:05:01 e apareceria
 * como duas automações de 21 e 15 em vez de uma de 36.
 *
 * As remoções não têm hora — a AC não guarda lápide —, portanto
 * agrupam-se só por tag, dentro da janela entre as duas leituras, que é
 * tudo o que se sabe sobre elas.
 *
 * **O lote nunca colapsa dados.** Devolve uma etiqueta por evento; as N
 * linhas continuam todas a existir e é a fila que as mostra juntas.
 */
export function marcarLotes<T extends EventoAgrupavel>(
  eventos: T[],
  limiar: number = LIMIAR_LOTE,
  janelaSegundos: number = JANELA_LOTE_SEGUNDOS
): Array<T & { lote: string | null; loteTamanho: number }> {
  const etiqueta = new Map<number, string>()

  // Remoções: por tag, sem tempo.
  const remocoesPorTag = new Map<string, number[]>()
  eventos.forEach((e, i) => {
    if (e.accao !== 'removida') return
    const lista = remocoesPorTag.get(String(e.tagId)) ?? []
    lista.push(i)
    remocoesPorTag.set(String(e.tagId), lista)
  })
  for (const [tagId, indices] of remocoesPorTag) {
    for (const i of indices) etiqueta.set(i, `removida|${tagId}`)
  }

  // Aplicações: por proximidade dentro da mesma tag.
  const aplicPorTag = new Map<string, Array<{ i: number; t: number }>>()
  eventos.forEach((e, i) => {
    if (e.accao !== 'aplicada') return
    if (!e.quando || Number.isNaN(e.quando.getTime())) return
    const lista = aplicPorTag.get(String(e.tagId)) ?? []
    lista.push({ i, t: e.quando.getTime() })
    aplicPorTag.set(String(e.tagId), lista)
  })
  for (const [tagId, lista] of aplicPorTag) {
    lista.sort((a, b) => a.t - b.t)
    let inicio = 0
    for (let k = 1; k <= lista.length; k++) {
      const cortou = k === lista.length || lista[k].t - lista[k - 1].t > janelaSegundos * 1000
      if (!cortou) continue
      const grupo = lista.slice(inicio, k)
      const chave = `${tagId}|${new Date(grupo[0].t).toISOString()}`
      for (const { i } of grupo) etiqueta.set(i, chave)
      inicio = k
    }
  }

  const contagem = new Map<string, number>()
  for (const chave of etiqueta.values()) contagem.set(chave, (contagem.get(chave) ?? 0) + 1)

  return eventos.map((e, i) => {
    const chave = etiqueta.get(i)
    const n = chave ? contagem.get(chave) ?? 0 : 0
    const emLote = !!chave && n >= limiar
    return { ...e, lote: emLote ? chave! : null, loteTamanho: emLote ? n : 1 }
  })
}

// ─────────────────────────────────────────────────────────────
// 5. A severidade
// ─────────────────────────────────────────────────────────────

export interface ContextoAluno {
  /** `combined.status === 'ACTIVE'`. NUNCA `userproducts.status`: são
   *  coisas diferentes e confundi-las produz alarmes falsos. */
  activo: boolean
  /** O maior `acessoAte` dos ciclos ainda está no futuro. */
  comAcessoPago: boolean
  /** Esse `acessoAte`, em YYYY-MM-DD, para a mensagem. */
  acessoAte: string
  /** YYMM com compra não reembolsada. Inclui a coorte do ano 2. */
  periodosPagos: Set<string>
  /** Tags de pertença por período, antes deste evento. */
  tagsPorPeriodo: Map<string, number>
  /** Sem timeline não se valida nada — mas também não se ignora. */
  temTimeline: boolean
}

export interface Veredicto {
  severidade: Severidade
  desalinha: string | null
}

const OK: Veredicto = { severidade: 'aviso', desalinha: null }

/**
 * Uma lista plana ninguém lê. O que separa um problema de trinta e
 * quatro é a condição do acesso pago: a automação de 30/08/2026 tirou a
 * `Alunos OGI Ativos` a 34 pessoas e só uma delas ainda tinha acesso.
 */
export function classificarSeveridade(
  evento: { accao: 'aplicada' | 'removida'; tipo: TipoTag; tagId: string; tagNome: string },
  ctx: ContextoAluno
): Veredicto {
  if (!ctx.activo) return { severidade: 'ruido', desalinha: null }

  if (!ctx.temTimeline) {
    // Não desaparece em silêncio: foi assim que perdi quatro divergências
    // numa medição, por as ter filtrado sem dar por isso.
    return { severidade: 'aviso', desalinha: 'sem timeline para validar' }
  }

  // ── As duas obrigatórias nomeadas ──────────────────────────
  const obrigatoria = TAGS_OBRIGATORIAS.find((t) => t.id === String(evento.tagId))
  if (obrigatoria) {
    if (evento.accao === 'removida' && ctx.comAcessoPago) {
      return {
        severidade: 'grave',
        desalinha: `perdeu a obrigatória "${obrigatoria.nome}" e tem acesso pago até ${ctx.acessoAte}`
      }
    }
    return OK
  }

  // ── A "Aluno OGI Antigo": vigiada sem ser obrigatória ──────
  const estado = TAGS_ESTADO_VIGIADAS.find((t) => t.id === String(evento.tagId))
  if (estado) {
    if (evento.accao === 'aplicada' && ctx.comAcessoPago) {
      return {
        severidade: 'grave',
        desalinha: `marcado como "${estado.nome}" e tem acesso pago até ${ctx.acessoAte}`
      }
    }
    return OK
  }

  // ── A tag da turma actual ──────────────────────────────────
  const periodo = periodoDaTag(evento.tagNome)
  if (!periodo) return OK

  const pago = ctx.periodosPagos.has(periodo)
  const jaTinha = ctx.tagsPorPeriodo.get(periodo) ?? 0

  if (evento.accao === 'aplicada') {
    if (jaTinha >= 1) {
      return { severidade: 'grave', desalinha: `ficou com duas tags de turma do período ${periodo}` }
    }
    if (!pago) {
      return { severidade: 'grave', desalinha: `ganhou a tag de ${periodo} e não há compra que a pague` }
    }
    return OK
  }

  if (pago && ctx.comAcessoPago) {
    return {
      severidade: 'grave',
      desalinha: `perdeu a tag da turma de ${periodo} e tem acesso pago até ${ctx.acessoAte}`
    }
  }
  return OK
}

// ─────────────────────────────────────────────────────────────
// 6. A quarta obrigatória, que não é uma tag
// ─────────────────────────────────────────────────────────────

export type MudancaLista = 'entrou' | 'saiu' | 'sem-mudanca' | 'primeira-leitura'

/**
 * `null` não é `false`. Sem esta distinção, a primeira leitura da lista
 * acusaria milhares de saídas que nunca aconteceram.
 */
export function mudancaNaLista(antes: boolean | null | undefined, depois: boolean): MudancaLista {
  if (antes === null || antes === undefined) return 'primeira-leitura'
  if (antes === depois) return 'sem-mudanca'
  return depois ? 'entrou' : 'saiu'
}

export function severidadeDaLista(
  mudanca: MudancaLista,
  ctx: { activo: boolean; comAcessoPago: boolean; acessoAte: string }
): Veredicto {
  if (!ctx.activo) return { severidade: 'ruido', desalinha: null }
  if (mudanca === 'saiu' && ctx.comAcessoPago) {
    return {
      severidade: 'grave',
      desalinha: `saiu da lista obrigatória "Alunos OGI" e tem acesso pago até ${ctx.acessoAte}`
    }
  }
  return OK
}
