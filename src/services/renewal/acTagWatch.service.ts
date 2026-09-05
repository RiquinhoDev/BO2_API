// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acTagWatch.service.ts
// A vigilância: compara as tags obrigatórias na ActiveCampaign com
// o espelho da véspera e regista quem lhes mexeu quando não fomos
// nós.
//
// ⚠️ SÓ LÊ DA AC. Não aplica tags, não remove tags, não escreve
// uma única vez na ActiveCampaign. Se alguma vez aparecer aqui um
// `.post(` ou um `.delete(` contra a AC, é bug — há um teste que
// lê este ficheiro e falha se isso acontecer.
//
// Escreve apenas em `actagevents`, na nossa BD, e só quando
// `dryRun === false`.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import ACStudentTag from '../../models/ACStudentTag'
import AcTagEvent from '../../models/renewal/AcTagEvent'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import { lerTagsDaAc } from './acStudentTagsSync.service'
import { LISTA_OBRIGATORIA } from './tagsObrigatorias'
import {
  FotoTag,
  JANELA_LOTE_SEGUNDOS,
  LIMIAR_LOTE,
  classificarSeveridade,
  diffTags,
  marcarLotes,
  mudancaNaLista,
  periodoDaTag,
  severidadeDaLista,
  soAgoraVisivel,
  tagVigiada
} from './acTagWatch.regras'
import { construirContexto, dataOuNull, EstadoDasQuatro, medirEstado, norm } from './acTagWatch.context'

export interface AcTagWatchOpcoes {
  /** `dryRun !== false` — como em todo o resto do sistema. */
  dryRun?: boolean
  /**
   * Actualizar o espelho no fim. Por omissão **false**, para as corridas
   * serem repetíveis contra a mesma base. A corrida a sério passa true.
   */
  actualizarEspelho?: boolean
  limiarLote?: number
  janelaLoteSegundos?: number
  /** Minutos de tolerância ao cruzar com o `AcWriteLog`. */
  janelaNossaMinutos?: number
}

export interface AcTagWatchReport {
  dryRun: boolean
  espelhoBaseEm: Date | null
  alunosLidos: number
  alunosActivos: number
  /** Tags que o espelho passou a ver, com aplicação anterior à fotografia. */
  soAgoraVisiveis: Array<{ tagId: string; nome: string; associacoes: number }>
  aplicadas: number
  removidas: number
  listaEntrou: number
  listaSaiu: number
  porOrigem: { nosso: number; automacaoAC: number; maoHumana: number }
  porSeveridade: { grave: number; aviso: number; ruido: number }
  lotes: Array<{ chave: string; tamanho: number; tagNome: string }>
  eventosGravados: number
  jaExistiam: number
  graves: Array<{ email: string; desalinha: string; accao: string; tagNome: string; lote: number }>
  estadoDasQuatro: EstadoDasQuatro
  errors: Array<{ contexto: string; error: string }>
}

interface EventoInterno {
  email: string
  userId: mongoose.Types.ObjectId | null
  contactId: string | null
  alvo: 'tag' | 'lista'
  tagId: string
  tagNome: string
  tipo: 'canonica' | 'membresia' | 'outra'
  accao: 'aplicada' | 'removida'
  quando: Date | null
  baseEspelhoEm: Date | null
}

/**
 * Uma corrida da vigilância.
 *
 * A ordem importa: o diff corre **antes** de o espelho ser sobrescrito,
 * senão a base de comparação morre antes de ser lida.
 */
export async function correrAcTagWatch(opcoes: AcTagWatchOpcoes = {}): Promise<AcTagWatchReport> {
  const dryRun = opcoes.dryRun !== false
  const actualizarEspelho = opcoes.actualizarEspelho === true
  const limiar = opcoes.limiarLote ?? LIMIAR_LOTE
  const janela = opcoes.janelaLoteSegundos ?? JANELA_LOTE_SEGUNDOS
  const janelaNossa = (opcoes.janelaNossaMinutos ?? 180) * 60_000
  const detectadoEm = new Date()

  const report: AcTagWatchReport = {
    dryRun,
    espelhoBaseEm: null,
    alunosLidos: 0,
    alunosActivos: 0,
    soAgoraVisiveis: [],
    aplicadas: 0,
    removidas: 0,
    listaEntrou: 0,
    listaSaiu: 0,
    porOrigem: { nosso: 0, automacaoAC: 0, maoHumana: 0 },
    porSeveridade: { grave: 0, aviso: 0, ruido: 0 },
    lotes: [],
    eventosGravados: 0,
    jaExistiam: 0,
    graves: [],
    estadoDasQuatro: {
      tagTurma: { tem: 0, faltam: 0 },
      tag347: { tem: 0, faltam: 0 },
      tag676: { tem: 0, faltam: 0 },
      lista: { tem: 0, faltam: 0, porLer: 0 },
      tag710: { tem: 0 }
    },
    errors: []
  }

  // 1. Ler a AC. Leitura pura.
  const leitura = await lerTagsDaAc()
  report.errors.push(...leitura.report.errors)
  report.alunosLidos = leitura.porEmail.size

  // 2. O espelho da véspera, ANTES de ser sobrescrito.
  const espelho = (await (ACStudentTag as any)
    .find({})
    .select('email contactId tags naListaAlunosOgi syncedAt')
    .lean()
    .exec()) as Array<{
      email: string
      contactId?: string
      tags?: Array<{ tagId: string; nome: string; tipo: string; aplicadaEm?: Date | string | null }>
      naListaAlunosOgi?: boolean | null
      syncedAt?: Date
    }>

  const antesPorEmail = new Map(espelho.map((d) => [norm(d.email), d]))
  const datasEspelho = espelho.map((d) => dataOuNull(d.syncedAt)).filter(Boolean) as Date[]
  report.espelhoBaseEm = datasEspelho.sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  const idsNaFotografia = new Set<string>()
  for (const d of espelho) for (const t of d.tags ?? []) idsNaFotografia.add(String(t.tagId))

  // 3. Contexto dos alunos: quem está activo, até quando tem acesso, e
  //    qual é a tag da turma actual de cada um.
  const contexto = await construirContexto()
  report.alunosActivos = contexto.activos.size

  // 4. Diff, por aluno, já filtrado pelo escopo.
  const eventos: EventoInterno[] = []
  const soVisiveis = new Map<string, { nome: string; n: number }>()
  const emails = new Set([...antesPorEmail.keys(), ...[...leitura.porEmail.keys()].map(norm)])

  for (const email of emails) {
    const antesDoc = antesPorEmail.get(email)
    const agoraDoc = leitura.porEmail.get(email)
    const tagTurma = contexto.tagDaTurma.get(email) ?? null

    const antes: FotoTag[] = (antesDoc?.tags ?? []).map((t) => ({
      tagId: String(t.tagId),
      nome: String(t.nome),
      tipo: t.tipo as any,
      aplicadaEm: dataOuNull(t.aplicadaEm)
    }))
    const agora: FotoTag[] = (agoraDoc?.tags ?? []).map((t) => ({
      tagId: String(t.tagId),
      nome: String(t.nome),
      tipo: t.tipo,
      aplicadaEm: t.aplicadaEm ?? null
    }))

    const { aplicadas, removidas } = diffTags(antes, agora)

    for (const t of aplicadas) {
      if (soAgoraVisivel(t, idsNaFotografia, report.espelhoBaseEm)) {
        const r = soVisiveis.get(t.tagId) ?? { nome: t.nome, n: 0 }
        r.n += 1
        soVisiveis.set(t.tagId, r)
        continue
      }
      if (!tagVigiada(t, tagTurma)) continue
      eventos.push({
        email,
        userId: contexto.userIdPorEmail.get(email) ?? null,
        contactId: agoraDoc?.contactId ?? antesDoc?.contactId ?? null,
        alvo: 'tag',
        tagId: t.tagId,
        tagNome: t.nome,
        tipo: t.tipo,
        accao: 'aplicada',
        quando: t.aplicadaEm,
        baseEspelhoEm: report.espelhoBaseEm
      })
    }

    for (const t of removidas) {
      if (!tagVigiada(t, tagTurma)) continue
      eventos.push({
        email,
        userId: contexto.userIdPorEmail.get(email) ?? null,
        contactId: antesDoc?.contactId ?? null,
        alvo: 'tag',
        tagId: t.tagId,
        tagNome: t.nome,
        tipo: t.tipo,
        accao: 'removida',
        // As remoções não têm hora na AC. O `syncedAt` do espelho é o
        // mais tarde que se sabe, e é o que torna a chave estável.
        quando: dataOuNull(antesDoc?.syncedAt) ?? report.espelhoBaseEm,
        baseEspelhoEm: report.espelhoBaseEm
      })
    }

    // A quarta obrigatória, que não é uma tag.
    if (leitura.report.listaLida) {
      const mudanca = mudancaNaLista(antesDoc?.naListaAlunosOgi, leitura.naLista.has(email))
      if (mudanca === 'entrou' || mudanca === 'saiu') {
        eventos.push({
          email,
          userId: contexto.userIdPorEmail.get(email) ?? null,
          contactId: agoraDoc?.contactId ?? antesDoc?.contactId ?? null,
          alvo: 'lista',
          tagId: LISTA_OBRIGATORIA.id,
          tagNome: LISTA_OBRIGATORIA.nome,
          tipo: 'canonica',
          accao: mudanca === 'entrou' ? 'aplicada' : 'removida',
          quando: dataOuNull(antesDoc?.syncedAt) ?? report.espelhoBaseEm,
          baseEspelhoEm: report.espelhoBaseEm
        })
      }
    }
  }

  report.soAgoraVisiveis = [...soVisiveis.entries()].map(([tagId, r]) => ({
    tagId,
    nome: r.nome,
    associacoes: r.n
  }))

  // 5. Lotes. Agrupa a vista, nunca colapsa dados.
  const comLote = marcarLotes(eventos, limiar, janela)

  const lotesVistos = new Map<string, { tamanho: number; tagNome: string }>()
  for (const e of comLote) {
    if (e.lote) lotesVistos.set(e.lote, { tamanho: e.loteTamanho, tagNome: e.tagNome })
  }
  report.lotes = [...lotesVistos.entries()].map(([chave, r]) => ({ chave, ...r }))

  // 6. Origem: subtrair o que fomos nós.
  const nossas = (await (AcWriteLog as any)
    .find({ dryRun: false, servico: { $in: ['turmaTag', 'reembolso'] } })
    .select('email tagId quando')
    .lean()
    .exec()) as Array<{ email: string; tagId?: string | null; quando: Date }>

  const escritasNossas = new Map<string, Date[]>()
  for (const l of nossas) {
    const k = `${norm(l.email)}|${String(l.tagId ?? '')}`
    const lista = escritasNossas.get(k) ?? []
    lista.push(new Date(l.quando))
    escritasNossas.set(k, lista)
  }

  // 7. Severidade e persistência.
  const docs: any[] = []
  for (const e of comLote) {
    const ctx = contexto.paraAluno(e.email)

    const veredicto =
      e.alvo === 'lista'
        ? severidadeDaLista(e.accao === 'aplicada' ? 'entrou' : 'saiu', {
            activo: ctx.activo,
            comAcessoPago: ctx.comAcessoPago,
            acessoAte: ctx.acessoAte
          })
        : classificarSeveridade(
            { accao: e.accao, tipo: e.tipo, tagId: e.tagId, tagNome: e.tagNome },
            ctx
          )

    const nossoNaJanela = (escritasNossas.get(`${norm(e.email)}|${e.tagId}`) ?? []).some(
      (d) => !e.quando || Math.abs(d.getTime() - e.quando.getTime()) <= janelaNossa
    )
    const origem: 'nosso' | 'automacaoAC' | 'maoHumana' = nossoNaJanela
      ? 'nosso'
      : e.lote
        ? 'automacaoAC'
        : 'maoHumana'

    if (e.accao === 'aplicada') {
      if (e.alvo === 'lista') report.listaEntrou += 1
      else report.aplicadas += 1
    } else if (e.alvo === 'lista') report.listaSaiu += 1
    else report.removidas += 1

    report.porOrigem[origem] += 1
    report.porSeveridade[veredicto.severidade] += 1

    if (veredicto.severidade === 'grave') {
      report.graves.push({
        email: e.email,
        desalinha: veredicto.desalinha ?? '',
        accao: e.accao,
        tagNome: e.tagNome,
        lote: e.loteTamanho
      })
    }

    const quandoISO = (e.quando ?? detectadoEm).toISOString()
    docs.push({
      quando: e.quando ?? detectadoEm,
      detectadoEm,
      baseEspelhoEm: e.baseEspelhoEm,
      email: e.email,
      userId: e.userId,
      contactId: e.contactId,
      alvo: e.alvo,
      tagId: e.tagId,
      tagNome: e.tagNome,
      tipo: e.tipo,
      periodo: e.alvo === 'tag' ? periodoDaTag(e.tagNome) : null,
      accao: e.accao,
      origem,
      lote: e.lote,
      loteTamanho: e.loteTamanho,
      alunoActivo: ctx.activo,
      severidade: veredicto.severidade,
      desalinha: veredicto.desalinha,
      estado: 'aberto',
      chave: `${e.email}|${e.alvo}|${e.tagId}|${e.accao}|${quandoISO}`
    })
  }

  if (!dryRun && docs.length) {
    const ops = docs.map((d) => ({
      updateOne: { filter: { chave: d.chave }, update: { $setOnInsert: d }, upsert: true }
    }))
    const r = await (AcTagEvent as any).bulkWrite(ops, { ordered: false })
    report.eventosGravados = r.upsertedCount ?? 0
    report.jaExistiam = docs.length - report.eventosGravados
  }

  // 8. Estado das quatro, agora.
  report.estadoDasQuatro = medirEstado(leitura.porEmail, leitura.naLista, leitura.report.listaLida, contexto)

  // 9. Só no fim, e só se pedido, o espelho é actualizado.
  if (actualizarEspelho && !dryRun) {
    const { syncAcStudentTags } = await import('./acStudentTagsSync.service')
    const r = await syncAcStudentTags()
    report.errors.push(...r.errors)
  }

  return report
}

export default correrAcTagWatch
