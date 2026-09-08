import { indiceDePeriodo } from './renewalCycles'
import { parseTurmaName, tipoDeTurma } from './turmaParser'
import { normalizarNomeTurma } from './turmaTagResolver'
import type { EntradaGerador } from './renewalTimeline.generator'
import type { Cadeia, Ciclo, Veredicto } from './renewalTimeline.types'

function temATag(tags: EntradaGerador['tags'], nome: string): boolean {
  const alvo = normalizarNomeTurma(nome)
  return tags.some((tag) => normalizarNomeTurma(tag.nome) === alvo)
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
}

function mesmoMes(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
}

const TOLERANCIA_ATRAS = 2
const TOLERANCIA_FRENTE = 4

/** Desde a coorte 2701 só se aceita o período exacto: o calendário passou a
 * ter uma coorte mensal estável e a janela antiga esconderia erros. */
export function toleranciasParaPeriodo(periodo: string): { atras: number; frente: number } {
  const indice = indiceDePeriodo(periodo)
  const corte = indiceDePeriodo('2701')
  return indice !== null && corte !== null && indice >= corte
    ? { atras: 0, frente: 0 }
    : { atras: TOLERANCIA_ATRAS, frente: TOLERANCIA_FRENTE }
}

/** Acima disto a tag foi posta muito depois da coorte que representa. */
export const DIAS_TAG_TARDIA = 90

export const DIA_MS = 24 * 60 * 60 * 1000

export type MotivoColocacaoCampanha = 'buraco-calendario' | 'janela-campanha'

function inicioDoDia(data: Date): Date {
  return new Date(Date.UTC(data.getUTCFullYear(), data.getUTCMonth(), data.getUTCDate()))
}

function periodoDaData(data: Date): string {
  return `${String(data.getUTCFullYear() % 100).padStart(2, '0')}${String(data.getUTCMonth() + 1).padStart(2, '0')}`
}

function inicioDoFimDoMes(periodo: Date): Date {
  return new Date(Date.UTC(periodo.getUTCFullYear(), periodo.getUTCMonth() + 1, 0))
}

/**
 * Classifica uma colocação de renovação sem transformar meses em tolerância.
 * A janela é de fronteira de calendário, medida em dias: 24/02 → 01/03 são
 * 5 dias; uma compra a 01/03 pode ficar na turma de Fevereiro.
 */
export function classificarColocacaoCampanha(
  compra: Date | null,
  turmaNome: string | null,
  periodosComTurma?: Iterable<string>,
  janelaDias = 5
): MotivoColocacaoCampanha | null {
  if (!compra || !turmaNome || janelaDias < 0) return null
  const turma = parseTurmaName(turmaNome)
  if (tipoDeTurma(turmaNome) !== 'renovacao' || !turma.periodYYMM || !turma.periodStart) return null

  const periodoCompra = periodoDaData(compra)
  if (turma.periodYYMM === periodoCompra) return null

  if (periodosComTurma) {
    const periodos = [...new Set(periodosComTurma)]
      .map(indiceDePeriodo)
      .filter((indice): indice is number => indice !== null)
      .sort((a, b) => a - b)
    const indiceCompra = indiceDePeriodo(periodoCompra)
    if (indiceCompra !== null && periodos.length > 0) {
      const cobertoPeloInventario = indiceCompra >= periodos[0] && indiceCompra <= periodos[periodos.length - 1]
      if (cobertoPeloInventario && !periodos.includes(indiceCompra)) return 'buraco-calendario'
    }
  }

  const compraDia = inicioDoDia(compra)
  const turmaIndice = indiceDePeriodo(turma.periodYYMM)
  const compraIndice = indiceDePeriodo(periodoCompra)
  if (turmaIndice === null || compraIndice === null) return null

  const dias = turmaIndice > compraIndice
    ? (turma.periodStart.getTime() - compraDia.getTime()) / DIA_MS
    : (compraDia.getTime() - inicioDoFimDoMes(turma.periodStart).getTime()) / DIA_MS
  return dias >= 0 && dias <= janelaDias ? 'janela-campanha' : null
}

/** Só serve para inverter uma data numa chave de ordenação. */
export const MAX_TEMPO = 9999999999999

/**
 * Extrai o YYMM de um nome de tag. Aceita os dois formatos:
 * "Aluno OGI L2311 - Turma 7" e "Aluno OGI 2606 - Renovação".
 * Tags de estado ("Alunos OGI Ativos") não têm período — null.
 */
export function calcularCadeia(e: EntradaGerador, ciclos: Ciclo[]): Cadeia {
  const ultimo = ciclos[ciclos.length - 1] ?? null

  // A AC guarda a data da COMPRA, que é a âncora do ciclo — a primeira
  // cobrança. Medido a 22/08/2026: em 47 alunos o campo 334 bate com a
  // âncora e em ZERO bate com a última cobrança. Comparar com a última
  // marcava como erradas 47 datas que estavam certas.
  const compraDoCiclo = ultimo?.compras[0]?.data ?? null

  // Para a frescura das tags é outra coisa: interessa a cobrança mais
  // recente, porque é essa que pode ser posterior à última sync.
  const ultimaCobranca = ultimo?.compras[ultimo.compras.length - 1]?.data ?? null

  let acCompraIgualUltimaVenda: Veredicto = 'sem-dados'
  if (e.acDataCompra && compraDoCiclo) {
    acCompraIgualUltimaVenda = mesmoDia(e.acDataCompra, compraDoCiclo) ? 'ok' : 'divergente'
  }

  let expiracaoIgualTurma: Veredicto = 'sem-dados'
  const fimDaTurma = e.turmaAtual ? parseTurmaName(e.turmaAtual.className).accessEndOgi : null
  const turmaRenovacao = e.turmaAtual ? tipoDeTurma(e.turmaAtual.className) === 'renovacao' : false
  const fimEsperado = turmaRenovacao ? ultimo?.acessoAte ?? null : fimDaTurma
  const colocacaoCampanha = classificarColocacaoCampanha(
    compraDoCiclo,
    ultimo?.turma?.nome ?? e.turmaAtual?.className ?? null,
    e.periodosComTurma,
    e.janelaCampanhaDias ?? 5
  )
  if (e.acExpiracao && fimEsperado) {
    if (mesmoMes(e.acExpiracao, fimEsperado)) {
      expiracaoIgualTurma = 'ok'
    } else {
      const mesmoEventoLegado = !!(
        turmaRenovacao &&
        compraDoCiclo &&
        e.legadoExpiracaoAncora &&
        mesmoDia(compraDoCiclo, e.legadoExpiracaoAncora)
      )
      expiracaoIgualTurma = mesmoEventoLegado || colocacaoCampanha ? 'legado' : 'divergente'
    }
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
    ultimaCobranca &&
    e.fontes.tags &&
    ultimaCobranca.getTime() > e.fontes.tags.getTime()
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

  const ultimoComCompra = [...ciclos].reverse().find((ciclo) => ciclo.compras.some((compra) => !compra.reembolsada)) ?? null
  const nomeTurmaParaSinal = ultimoComCompra?.turma?.nome ?? e.turmaAtual?.className ?? null
  const parsedTurma = nomeTurmaParaSinal ? parseTurmaName(nomeTurmaParaSinal) : null
  const compraTurma = ultimoComCompra?.compras.find((compra) => !compra.reembolsada)?.data ?? null
  const aberturaTurma = parsedTurma?.periodStart ?? null
  const indiceCompra = compraTurma ? indiceDePeriodo(`${String(compraTurma.getUTCFullYear() % 100).padStart(2, '0')}${String(compraTurma.getUTCMonth() + 1).padStart(2, '0')}`) : null
  const indiceAbertura = parsedTurma?.periodYYMM ? indiceDePeriodo(parsedTurma.periodYYMM) : null
  const mesesCompraAntes = indiceCompra !== null && indiceAbertura !== null ? indiceAbertura - indiceCompra : null
  const periodoCompraSinal = compraTurma ? periodoDaData(compraTurma) : null
  const periodoTurmaSinal = parsedTurma?.periodYYMM ?? null
  const indiceCompraSinal = periodoCompraSinal ? indiceDePeriodo(periodoCompraSinal) : null
  const indiceTurmaSinal = periodoTurmaSinal ? indiceDePeriodo(periodoTurmaSinal) : null
  const deltaDepoisDoAnoUm = indiceCompraSinal !== null && indiceTurmaSinal !== null
    ? indiceTurmaSinal - indiceCompraSinal - 12
    : null
  const turmaECoorteAnoDois = ultimoComCompra?.anos === 2 && deltaDepoisDoAnoUm !== null && deltaDepoisDoAnoUm >= 0 && deltaDepoisDoAnoUm <= 6
  const compraMuitoAntesDaTurma: Veredicto =
    compraTurma && aberturaTurma && mesesCompraAntes !== null
      ? turmaECoorteAnoDois || mesesCompraAntes <= 6 ? 'ok' : 'divergente'
      : 'sem-dados'
  const anosCompradosIgualTurma: Veredicto =
    ultimoComCompra && parsedTurma?.accessYears
      ? ultimoComCompra.anos === parsedTurma.accessYears ? 'ok' : 'divergente'
      : 'sem-dados'

  return {
    acCompraIgualUltimaVenda,
    expiracaoIgualTurma,
    tagIgualTurma,
    compraMuitoAntesDaTurma,
    anosCompradosIgualTurma,
    ciclosSemMudancaTurma: semMudanca,
    ciclosSemRegistoTurma: semRegisto,
    registoDeTurmas,
    tagsDesatualizadas,
    comparacoes: {
      acCompra: { esperado: compraDoCiclo, encontrado: e.acDataCompra },
      expiracao: { esperado: fimEsperado, encontrado: e.acExpiracao },
      tag: { esperado: ultimo?.tagEsperada ?? null, encontrado: tagEncontrada },
      compraTurma: { compra: compraTurma, abertura: aberturaTurma, meses: mesesCompraAntes },
      anos: { comprados: ultimoComCompra?.anos ?? null, turma: parsedTurma?.accessYears ?? null },
      ciclosComTurma: {
        esperado: ciclos.length,
        encontrado: ciclos.length - semMudanca - semRegisto
      }
    }
  }
}
