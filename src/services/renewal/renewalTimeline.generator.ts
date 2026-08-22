// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalTimeline.generator.ts
// O gerador. Puro e determinístico: recebe as vendas, as tags, a
// turma e as movimentações de UM aluno e devolve a timeline.
// Não lê BD, não chama APIs, não olha para o relógio.
//
// A linha do tempo é a das VENDAS. Tags e turmas penduram-se
// nela, nunca o contrário — assim um desvio aponta sempre para
// quem se desviou.
//
// A unidade de emparelhamento é a COORTE, não o ciclo. Um ciclo
// de 2 anos atravessa duas coortes — a do ano da compra e a de
// 12 meses depois — e recebe uma tag por cada, sem nova compra.
// Dos 148 ciclos de 2 anos medidos a 21/08/2026, 77% tinham as
// duas tags; tratá-las como uma só marcava 114 alunos certos
// como tendo tag órfã.
//
// O emparelhamento é por PERÍODO, com ±2 meses de tolerância nas
// duas direcções: para a frente porque nunca houve coortes em
// Abril, Agosto, Outubro nem Dezembro e quem compra nesses meses
// cai na seguinte; para trás porque quem compra a meio do mês
// entra na coorte já aberta (o zz.carlos comprou a 03/12/2024 e
// tem a tag L2411). A janela apanha 90,5% das tags reais.
// ════════════════════════════════════════════════════════════

import { agruparCiclos, indiceDePeriodo } from './renewalCycles'
import { resolverTagDaTurma, normalizarNomeTurma } from './turmaTagResolver'
import { parseTurmaName } from './turmaParser'
import type {
  VendaEntrada,
  TagEntrada,
  TurmaEntrada,
  Ciclo,
  CoorteCiclo,
  AlertaCiclo,
  Cadeia,
  Veredicto,
  TagOrfa,
  TagDuplicada,
  TagEstado,
  TimelineGerada
} from './renewalTimeline.types'

export interface EntradaGerador {
  vendas: VendaEntrada[]
  tags: TagEntrada[]
  turmaAtual: TurmaEntrada | null
  /** Movimentações registadas em `studentclasshistories`, mais antiga primeiro. */
  movimentacoes: TurmaEntrada[]
  acExpiracao: Date | null
  acDataCompra: Date | null
  excepcoesTurmaTag: Map<string, string>
  fontes: { vendas: Date | null; tags: Date | null; ac: Date | null }
}

/**
 * A tolerância é assimétrica porque os dois lados são coisas diferentes.
 *
 * Para TRÁS é entrar numa coorte que já estava aberta — acontece a quem
 * compra a meio do mês (o zz.carlos comprou a 03/12/2024 e tem a tag
 * L2411). Não passa de dois meses: só 5 dos 308 alunos de turmas base
 * estão deste lado.
 *
 * Para a FRENTE é esperar que a turma abra, e isso demora. Medido a
 * 22/08/2026 nos 308: +2 cobre 94,5%, +3 cobre 97,7% e +4 cobre 99%.
 * Dez alunos compraram em 2506 e entraram na turma de 2509. Com uma
 * janela de 2 ficavam marcados como não tendo tag.
 */
const TOLERANCIA_ATRAS = 2
const TOLERANCIA_FRENTE = 4

/** Acima disto a tag foi posta muito depois da coorte que representa. */
const DIAS_TAG_TARDIA = 90

const DIA_MS = 24 * 60 * 60 * 1000

/** Só serve para inverter uma data numa chave de ordenação. */
const MAX_TEMPO = 9999999999999

/**
 * Extrai o YYMM de um nome de tag. Aceita os dois formatos:
 * "Aluno OGI L2311 - Turma 7" e "Aluno OGI 2606 - Renovação".
 * Tags de estado ("Alunos OGI Ativos") não têm período — null.
 */
export function periodoDaTag(nome: string): string | null {
  const m = String(nome).match(/\bL?(\d{4})\b/)
  if (!m) return null
  const mm = Number(m[1].slice(2, 4))
  if (mm < 1 || mm > 12) return null
  return m[1]
}

/** O aluno tem esta tag, esteja ela emparelhada com que coorte estiver. */
function temATag(tags: TagEntrada[], nome: string): boolean {
  const alvo = normalizarNomeTurma(nome)
  return tags.some((t) => normalizarNomeTurma(t.nome) === alvo)
}

const MENCIONA_PERCURSO = /turma|renova(ç|c)(ã|a)o/i

/** Tag de percurso = tem período E fala de turma/renovação. */
function ehTagDePercurso(nome: string): boolean {
  return periodoDaTag(nome) !== null && MENCIONA_PERCURSO.test(nome)
}

/** "YYMM" mais `meses`, de volta a "YYMM". */
function somarMeses(yymm: string, meses: number): string {
  const yy = Number(yymm.slice(0, 2))
  const mm = Number(yymm.slice(2, 4))
  const total = (2000 + yy) * 12 + (mm - 1) + meses
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  return `${String(ano % 100).padStart(2, '0')}${String(mes).padStart(2, '0')}`
}

/** Um lugar por preencher: a coorte N de um ciclo. */
interface Lugar {
  ciclo: number
  ano: 1 | 2
  periodo: string
  doisAnos: boolean
}

/**
 * Emparelha candidatos (tags ou turmas) com lugares, um para um,
 * pela distância em meses. Só conta |distância| ≤ TOLERANCIA_MESES.
 *
 * Greedy pela distância, com desempate por índice para o resultado
 * não depender da ordem de entrada — o gerador tem de ser
 * determinístico e há um teste que o exige.
 */
function emparelhar(
  lugares: Lugar[],
  candidatos: Array<{ indice: number; periodo: string | null; desempate: string; doisAnos?: boolean }>
): Map<number, number> {
  const pares: Array<{
    lugar: number
    candidato: number
    dist: number
    atras: number
    tipoIncompativel: number
    desempate: string
  }> = []

  lugares.forEach((lug, iLugar) => {
    const idxLugar = indiceDePeriodo(lug.periodo)
    if (idxLugar === null) return
    for (const cand of candidatos) {
      const idxCand = indiceDePeriodo(cand.periodo)
      if (idxCand === null) continue
      const delta = idxCand - idxLugar
      if (delta > TOLERANCIA_FRENTE || delta < -TOLERANCIA_ATRAS) continue
      const dist = Math.abs(delta)
      // à mesma distância, o candidato à frente da coorte ganha ao de
      // trás: a tolerância para a frente existe porque não há coortes
      // em Abril, Agosto, Outubro nem Dezembro e o comprador cai na
      // seguinte; a de trás é só a entrada numa coorte já aberta.
      pares.push({
        lugar: iLugar,
        candidato: cand.indice,
        dist,
        atras: idxCand >= idxLugar ? 0 : 1,
        // Quando o período empata, o marcador explícito [2anos]
        // distingue a tag da compra com extensão da tag anual.
        tipoIncompativel:
          cand.doisAnos === undefined || cand.doisAnos === lug.doisAnos ? 0 : 1,
        desempate: cand.desempate
      })
    }
  })

  // o último critério é uma chave do PRÓPRIO candidato — o id da tag,
  // ou "é a turma actual / quando entrou nela" — e nunca a ordem nem
  // a posição em que chegou. Dois candidatos empatados têm de dar
  // sempre o mesmo vencedor, venha a lista como vier.
  pares.sort(
    (a, b) =>
      a.dist - b.dist ||
      a.atras - b.atras ||
      a.tipoIncompativel - b.tipoIncompativel ||
      a.lugar - b.lugar ||
      (a.desempate < b.desempate ? -1 : a.desempate > b.desempate ? 1 : 0)
  )

  const porLugar = new Map<number, number>()
  const usados = new Set<number>()
  for (const p of pares) {
    if (porLugar.has(p.lugar) || usados.has(p.candidato)) continue
    porLugar.set(p.lugar, p.candidato)
    usados.add(p.candidato)
  }
  return porLugar
}

/** A coorte mais próxima que explica um período, sem consumir o lugar. */
function coorteCompativel(periodo: string | null, lugares: Lugar[]): Lugar | null {
  const idxTag = indiceDePeriodo(periodo)
  if (idxTag === null) return null

  const compativeis = lugares
    .map((lugar, indice) => {
      const idxCoorte = indiceDePeriodo(lugar.periodo)
      if (idxCoorte === null) return null
      const diferenca = idxTag - idxCoorte
      if (diferenca > TOLERANCIA_FRENTE || diferenca < -TOLERANCIA_ATRAS) return null
      return {
        lugar,
        indice,
        distancia: Math.abs(diferenca),
        atras: diferenca >= 0 ? 0 : 1
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.distancia - b.distancia || a.atras - b.atras || a.indice - b.indice)

  return compativeis[0]?.lugar ?? null
}

/** Duas datas no mesmo dia (UTC). */
function mesmoDia(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

/** Duas datas no mesmo mês (UTC). */
function mesmoMes(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

export function gerarTimeline(e: EntradaGerador): TimelineGerada {
  const base = agruparCiclos(e.vendas)

  // ── turmas: movimentações + turma actual, sem duplicar classId ──
  const turmas: TurmaEntrada[] = []
  const vistos = new Set<string>()
  for (const t of [...e.movimentacoes, ...(e.turmaAtual ? [e.turmaAtual] : [])]) {
    const chave = t.classId ?? normalizarNomeTurma(t.className)
    if (vistos.has(chave)) continue
    vistos.add(chave)
    turmas.push(t)
  }

  // ── um lugar por coorte: 1 no ciclo de um ano, 2 no de dois ──
  const lugares: Lugar[] = []
  base.forEach((c, i) => {
    lugares.push({ ciclo: i, ano: 1, periodo: c.periodo, doisAnos: c.anos === 2 })
    if (c.anos === 2) {
      lugares.push({ ciclo: i, ano: 2, periodo: somarMeses(c.periodo, 12), doisAnos: true })
    }
  })

  const tagsPercurso = e.tags
    .map((t, i) => ({ tag: t, indice: i }))
    .filter((x) => ehTagDePercurso(x.tag.nome))

  const parTags = emparelhar(
    lugares,
    tagsPercurso.map((x) => ({
      indice: x.indice,
      periodo: periodoDaTag(x.tag.nome),
      doisAnos: /\[\s*2\s*anos?\s*\]/i.test(x.tag.nome),
      desempate: String(x.tag.tagId).padStart(12, '0')
    }))
  )

  // A chave da turma não pode ser a posição no array: quem chama
  // decide essa ordem, e o desempate voltaria a depender dela. Vem
  // da própria turma — primeiro se é a actual, depois quando entrou
  // (mais recente ganha), e o nome como último critério.
  const chaveDaAtual = e.turmaAtual
    ? e.turmaAtual.classId ?? normalizarNomeTurma(e.turmaAtual.className)
    : null

  const parTurmas = emparelhar(
    lugares,
    turmas.map((t, i) => {
      const chave = t.classId ?? normalizarNomeTurma(t.className)
      const ehAtual = chaveDaAtual !== null && chave === chaveDaAtual
      const entrada = t.entrouEm ? t.entrouEm.getTime() : 0
      return {
        indice: i,
        periodo: parseTurmaName(t.className).periodYYMM,
        desempate: `${ehAtual ? '0' : '1'}${String(MAX_TEMPO - entrada).padStart(14, '0')}${normalizarNomeTurma(t.className)}`
      }
    })
  )

  // A turma do ciclo é a que caiu em qualquer uma das suas coortes. Num
  // ciclo de 2 anos há duas coortes e podem cair duas turmas — e aí a
  // ACTUAL ganha sempre, mesmo que a do histórico esteja mais perto em
  // período. É ela que decide a tag esperada e a expiração; comparar
  // contra uma turma que o aluno já deixou acusa-o de um desvio que não
  // tem. Medido a 22/08: apanhava 4 alunos, entre eles a gaelle.pires,
  // que foi movida e devolvida em dois dias e ficou com a turma errada.
  const turmaDoCiclo = new Map<number, TurmaEntrada>()
  lugares.forEach((lug, iLugar) => {
    const iTurma = parTurmas.get(iLugar)
    if (iTurma === undefined) return
    const candidata = turmas[iTurma]
    const chave = candidata.classId ?? normalizarNomeTurma(candidata.className)
    const ehAtual = chaveDaAtual !== null && chave === chaveDaAtual
    if (!turmaDoCiclo.has(lug.ciclo) || ehAtual) turmaDoCiclo.set(lug.ciclo, candidata)
  })

  // A turma actual pertence sempre ao ÚLTIMO ciclo — é onde o aluno está
  // agora. O período é informação para as comparações, não uma condição
  // para apagar esse facto.
  if (e.turmaAtual && base.length > 0) {
    turmaDoCiclo.set(base.length - 1, e.turmaAtual)
  }

  const turmasPorMapear = new Set<string>()
  const chaveAtualParaMapa = e.turmaAtual
    ? e.turmaAtual.classId ?? normalizarNomeTurma(e.turmaAtual.className)
    : null

  // Todas as turmas são avaliadas mesmo que não caiam em coorte
  // nenhuma. No histórico, só nomes com período são accionáveis;
  // sentinelas antigas como "Nome não disponível" não são turmas
  // para mapear. A turma actual é sempre avaliada.
  for (const t of turmas) {
    const resolucao = resolverTagDaTurma(t.className, e.excepcoesTurmaTag)
    const chave = t.classId ?? normalizarNomeTurma(t.className)
    const ehAtual = chaveAtualParaMapa !== null && chave === chaveAtualParaMapa
    const temPeriodo = parseTurmaName(t.className).periodYYMM !== null
    if (resolucao.origem === null && (ehAtual || temPeriodo)) {
      turmasPorMapear.add(t.className)
    }
  }

  // passa a true assim que um ciclo anterior tiver turma conhecida
  let conheceTurmaAnterior = false

  const ciclos: Ciclo[] = base.map((c, i) => {
    const turma = turmaDoCiclo.get(i) ?? null
    const resolucao = turma ? resolverTagDaTurma(turma.className, e.excepcoesTurmaTag) : null
    if (turma && resolucao?.origem === null) turmasPorMapear.add(turma.className)

    const coortes: CoorteCiclo[] = lugares
      .map((lug, iLugar) => ({ lug, iLugar }))
      .filter((x) => x.lug.ciclo === i)
      .map(({ lug, iLugar }) => {
        const iTag = parTags.get(iLugar)
        const tag = iTag === undefined ? null : e.tags[iTag]
        return {
          periodo: lug.periodo,
          ano: lug.ano,
          tag: tag ? { id: tag.tagId, nome: tag.nome, aplicadaEm: tag.aplicadaEm } : null
        }
      })

    const alertas: AlertaCiclo[] = []
    if (!coortes[0]?.tag) alertas.push('sem-tag')
    if (coortes[1] && !coortes[1].tag) alertas.push('sem-tag-ano-2')
    // Sem turma há duas leituras muito diferentes: ou já se conhecia
    // uma turma antes e este ciclo não a mudou (desvio real), ou nunca
    // se conheceu nenhuma e não sabemos onde ele esteve (lacuna nossa,
    // porque o sync substitui a turma em vez de registar a mudança).
    // Dizer "ficou na mesma turma" no segundo caso é afirmar o que não
    // se sabe — e são 98% dos casos.
    if (!turma) {
      alertas.push(conheceTurmaAnterior ? 'sem-mudanca-turma' : 'sem-registo-turma')
    }
    if (turma && resolucao?.origem === null) alertas.push('tag-por-definir')

    // a tag tardia mede-se contra o início da SUA coorte, não contra
    // a compra: a do ano 2 chega legitimamente um ano depois
    const ancora = c.compras[0].data
    for (const coorte of coortes) {
      if (!coorte.tag?.aplicadaEm) continue
      const inicio = new Date(ancora.getTime())
      inicio.setUTCFullYear(inicio.getUTCFullYear() + (coorte.ano - 1))
      const dias = (coorte.tag.aplicadaEm.getTime() - inicio.getTime()) / DIA_MS
      if (dias > DIAS_TAG_TARDIA) {
        if (!alertas.includes('tag-tardia')) alertas.push('tag-tardia')
      }
    }

    // A pergunta é "o aluno TEM a tag que esta turma pede?", não "foi a
    // esta coorte que ela calhou". O emparelhamento é um-para-um, por
    // isso a tag certa pode ter ficado noutra coorte do mesmo aluno —
    // e acusá-lo por isso era um falso alarme. Medido a 22/08: de 16
    // marcados, 4 tinham a tag certa noutro lugar.
    if (
      resolucao?.tagNome &&
      coortes.some((x) => x.tag) &&
      !temATag(e.tags, resolucao.tagNome)
    ) {
      alertas.push('tag-diferente-da-turma')
    }

    if (turma) conheceTurmaAnterior = true

    return {
      ...c,
      coortes,
      turma: turma ? { nome: turma.className, classId: turma.classId, entrouEm: turma.entrouEm } : null,
      tagEsperada: resolucao?.tagNome ?? null,
      alertas
    }
  })

  const idsEmCiclos = new Set(
    ciclos.flatMap((c) => c.coortes.map((x) => x.tag?.id)).filter(Boolean) as string[]
  )

  const tagsNaoEmparelhadas = tagsPercurso.filter((x) => !idsEmCiclos.has(x.tag.tagId))

  const tagsOrfas: TagOrfa[] = tagsNaoEmparelhadas
    .filter((x) => coorteCompativel(periodoDaTag(x.tag.nome), lugares) === null)
    .map((x) => ({
      id: x.tag.tagId,
      nome: x.tag.nome,
      periodo: periodoDaTag(x.tag.nome),
      aplicadaEm: x.tag.aplicadaEm
    }))

  const tagsDuplicadas: TagDuplicada[] = tagsNaoEmparelhadas.flatMap((x) => {
    const periodo = periodoDaTag(x.tag.nome)
    const coorte = coorteCompativel(periodo, lugares)
    if (!coorte) return []
    return [{
      id: x.tag.tagId,
      nome: x.tag.nome,
      periodo,
      aplicadaEm: x.tag.aplicadaEm,
      coortePeriodo: coorte.periodo
    }]
  })

  const tagsEstado: TagEstado[] = e.tags
    .filter((t) => !ehTagDePercurso(t.nome))
    .map((t) => ({ id: t.tagId, nome: t.nome, aplicadaEm: t.aplicadaEm }))

  return {
    ciclos,
    tagsOrfas,
    tagsDuplicadas,
    tagsEstado,
    cadeia: calcularCadeia(e, ciclos),
    turmasPorMapear: [...turmasPorMapear]
  }
}

/**
 * Os quatro elos da faixa. Cada um compara-se com o de cima na
 * hierarquia — nunca com o de baixo.
 */
function calcularCadeia(e: EntradaGerador, ciclos: Ciclo[]): Cadeia {
  const ultimo = ciclos[ciclos.length - 1] ?? null

  // a última venda é a última COBRANÇA, não a compra âncora do ciclo:
  // num plano de prestações a AC guarda a data da última, e comparar
  // com a âncora dava divergente em todos eles.
  const ultimaVendaDoCiclo = ultimo?.compras[ultimo.compras.length - 1]?.data ?? null

  let acCompraIgualUltimaVenda: Veredicto = 'sem-dados'
  if (e.acDataCompra && ultimaVendaDoCiclo) {
    acCompraIgualUltimaVenda = mesmoDia(e.acDataCompra, ultimaVendaDoCiclo) ? 'ok' : 'divergente'
  }

  let expiracaoIgualTurma: Veredicto = 'sem-dados'
  const fimDaTurma = e.turmaAtual ? parseTurmaName(e.turmaAtual.className).accessEndOgi : null
  if (e.acExpiracao && fimDaTurma) {
    expiracaoIgualTurma = mesmoMes(e.acExpiracao, fimDaTurma) ? 'ok' : 'divergente'
  }

  // Basta o aluno ter a tag — não interessa a que coorte ela ficou
  // agarrada no emparelhamento. Ver a nota em `tag-diferente-da-turma`.
  const temAEsperada = !!ultimo?.tagEsperada && temATag(e.tags, ultimo.tagEsperada)

  let tagIgualTurma: Veredicto = 'sem-dados'
  if (ultimo && ultimo.tagEsperada) {
    tagIgualTurma = temAEsperada ? 'ok' : 'divergente'
  }

  // Quando a tem, mostra-se a própria — o painel diria "divergente" com
  // as duas colunas iguais, o que confundia. Quando não a tem, mostra-se
  // a tag mais recente que tem, para se ver de que é que difere.
  const tagEncontrada = temAEsperada
    ? ultimo!.tagEsperada
    : [...(ultimo?.coortes ?? [])].reverse().find((x) => x.tag)?.tag?.nome ?? null

  // Uma venda mais recente do que a última sync de tags explica
  // sozinha um desvio — dizê-lo evita acusar quem só está à espera.
  const tagsDesatualizadas = !!(
    ultimaVendaDoCiclo &&
    e.fontes.tags &&
    ultimaVendaDoCiclo.getTime() > e.fontes.tags.getTime()
  )

  const semMudanca = ciclos.filter((c) => c.alertas.includes('sem-mudanca-turma')).length
  const semRegisto = ciclos.filter((c) => c.alertas.includes('sem-registo-turma')).length

  // 'divergente' só quando o aluno tinha turma e ela não acompanhou. A
  // falta de registo é lacuna de dados nossa, e um painel que serve para
  // validar não a pode apresentar como erro do aluno.
  const registoDeTurmas: Veredicto =
    ciclos.length === 0
      ? 'sem-dados'
      : semMudanca > 0
        ? 'divergente'
        : semRegisto > 0
          ? 'sem-dados'
          : 'ok'

  return {
    acCompraIgualUltimaVenda,
    expiracaoIgualTurma,
    tagIgualTurma,
    ciclosSemMudancaTurma: semMudanca,
    ciclosSemRegistoTurma: semRegisto,
    registoDeTurmas,
    tagsDesatualizadas,
    comparacoes: {
      acCompra: { esperado: ultimaVendaDoCiclo, encontrado: e.acDataCompra },
      expiracao: { esperado: fimDaTurma, encontrado: e.acExpiracao },
      tag: { esperado: ultimo?.tagEsperada ?? null, encontrado: tagEncontrada },
      ciclosComTurma: {
        esperado: ciclos.length,
        encontrado: ciclos.length - semMudanca - semRegisto
      }
    }
  }
}

export default gerarTimeline
