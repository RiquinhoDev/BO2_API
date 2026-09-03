// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalTimeline.service.ts
// A camada que liga o gerador puro à base de dados: lê os
// espelhos locais, traduz, chama `gerarTimeline` e faz upsert em
// `studentrenewaltimelines`.
//
// Só toca na nossa BD. As chamadas à Hotmart e à AC já foram
// feitas pelas syncs próprias — este passo trabalha sobre o que
// elas deixaram, por isso são segundos e não minutos.
//
// Cada corrida SUBSTITUI a timeline do aluno. Correr duas vezes
// dá o mesmo resultado; não acumula nem duplica.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import HotmartSaleHistory from '../../models/HotmartSaleHistory'
import ACStudentTag from '../../models/ACStudentTag'
import ACRenewalData from '../../models/ACRenewalData'
import StudentClassHistory from '../../models/StudentClassHistory'
import StudentRenewalTimeline, { type IStudentRenewalTimeline } from '../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../models/TurmaTagMap'
import { User } from '../../models'
import { gerarTimeline, type EntradaGerador } from './renewalTimeline.generator'
import type { VendaEntrada } from './renewalTimeline.types'
import { parseTurmaName, tipoDeTurma } from './turmaParser'

export interface DadosAluno {
  userId: string
  email: string
  vendas: { sales: VendaEntrada[]; lastSyncedAt: Date | null } | null
  tags: {
    tags: Array<{ tagId: string; nome: string; tipo: string; aplicadaEm: Date | null }>
    syncedAt: Date | null
  } | null
  ac: { purchaseDate: Date | null; expirationDate: Date | null; lastSyncedAt: Date | null } | null
  movimentacoes: Array<{ classId: string | null; className: string; dateMoved: Date | null }>
  turmaAtual: { classId: string | null; className: string; entrouEm: Date | null } | null
  periodosComTurma?: string[]
  janelaCampanhaDias?: number
}

export interface TimelineSyncReport {
  alunos: number
  gerados: number
  comAlertas: number
  turmasPorMapear: string[]
  errors: Array<{ email: string; error: string }>
}

/**
 * Mantém a âncora do evento cuja divergência já foi classificada. Tanto
 * `legado` como `a-menos` descrevem o mesmo evento histórico; só diferem na
 * direcção do desvio. Perder a âncora faria a geração seguinte voltar a
 * chamar-lhe uma divergência nova.
 */
export function ancoraDoEventoLegado(timelineAnterior: any): Date | null {
  const veredicto = timelineAnterior?.cadeia?.expiracaoIgualTurma
  if (veredicto !== 'legado' && veredicto !== 'a-menos') return null

  const ciclos = timelineAnterior?.ciclos ?? []
  const valor = ciclos[ciclos.length - 1]?.compras?.[0]?.data
  if (!valor) return null

  const data = valor instanceof Date ? valor : new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data
}

/** Traduz documentos da BD para o input puro do gerador. */
export function montarEntrada(
  d: DadosAluno,
  excepcoes: Map<string, string>,
  legadoExpiracaoAncora: Date | null = null
): EntradaGerador {
  return {
    vendas: d.vendas?.sales ?? [],
    tags: (d.tags?.tags ?? []).map((t) => ({
      tagId: t.tagId,
      nome: t.nome,
      aplicadaEm: t.aplicadaEm ?? null
    })),
    turmaAtual: d.turmaAtual,
    movimentacoes: [...d.movimentacoes]
      .filter((m) => !!m.className)
      .sort((a, b) => (a.dateMoved?.getTime() ?? 0) - (b.dateMoved?.getTime() ?? 0))
      .map((m) => ({ classId: m.classId, className: m.className, entrouEm: m.dateMoved })),
    acExpiracao: d.ac?.expirationDate ?? null,
    acDataCompra: d.ac?.purchaseDate ?? null,
    excepcoesTurmaTag: excepcoes,
    periodosComTurma: d.periodosComTurma,
    janelaCampanhaDias: d.janelaCampanhaDias,
    fontes: {
      vendas: d.vendas?.lastSyncedAt ?? null,
      tags: d.tags?.syncedAt ?? null,
      ac: d.ac?.lastSyncedAt ?? null
    },
    legadoExpiracaoAncora
  }
}

/** Carrega as excepções turma→tag da BD para um Map já normalizado. */
export async function carregarExcepcoes(): Promise<Map<string, string>> {
  const docs = (await (TurmaTagMap as any)
    .find({})
    .select('classNameNormalizado tagNome')
    .lean()
    .exec()) as Array<{ classNameNormalizado: string; tagNome: string }>
  return new Map(docs.map((d) => [d.classNameNormalizado, d.tagNome]))
}

/** A turma actual do aluno: a entrada activa mais recente da Hotmart. */
function turmaActualDoUser(u: any): DadosAluno['turmaAtual'] {
  const turmas: any[] = u?.hotmart?.enrolledClasses ?? []
  const activas = turmas.filter((t) => t?.className && t?.isActive !== false)
  const escolhida = activas[activas.length - 1] ?? turmas[turmas.length - 1] ?? null
  if (!escolhida) return null
  return {
    classId: escolhida.classId ?? null,
    className: escolhida.className,
    entrouEm: escolhida.enrolledAt ?? null
  }
}

/**
 * Gera as timelines dos alunos que têm pelo menos um dos três
 * espelhos (ou só dos emails indicados), lendo em bloco e fazendo
 * um único bulkWrite.
 */
export async function gerarTimelinesEmLote(
  emails?: string[],
  agora: Date = new Date()
): Promise<TimelineSyncReport> {
  const report: TimelineSyncReport = {
    alunos: 0,
    gerados: 0,
    comAlertas: 0,
    turmasPorMapear: [],
    errors: []
  }

  const filtroEmail = emails?.length
    ? { email: { $in: emails.map((e) => e.toLowerCase().trim()) } }
    : {}

  const [excepcoes, vendasDocs, tagsDocs, acDocs] = await Promise.all([
    carregarExcepcoes(),
    (HotmartSaleHistory as any).find(filtroEmail).lean().exec(),
    (ACStudentTag as any).find(filtroEmail).lean().exec(),
    (ACRenewalData as any).find(filtroEmail).lean().exec()
  ])

  const porEmailVendas = new Map<string, any>(vendasDocs.map((d: any) => [d.email, d]))
  const porEmailTags = new Map<string, any>(tagsDocs.map((d: any) => [d.email, d]))
  const porEmailAc = new Map<string, any>(acDocs.map((d: any) => [d.email, d]))
  const emailsAlvo = [
    ...new Set([...porEmailVendas.keys(), ...porEmailTags.keys(), ...porEmailAc.keys()])
  ]

  report.alunos = emailsAlvo.length
  if (!emailsAlvo.length) return report

  const users = (await (User as any)
    .find({ email: { $in: emailsAlvo } })
    .select('_id email hotmart.enrolledClasses')
    .lean()
    .exec()) as any[]
  const userPorEmail = new Map(users.map((u) => [String(u.email).toLowerCase().trim(), u]))

  const [movimentacoes, timelinesAnteriores] = await Promise.all([
    (StudentClassHistory as any)
      .find({ studentId: { $in: users.map((u) => u._id) } })
      .select('studentId classId className dateMoved')
      .lean()
      .exec(),
    (StudentRenewalTimeline as any)
      .find({ userId: { $in: users.map((u) => u._id) } })
      .select('userId ciclos cadeia.expiracaoIgualTurma')
      .lean()
      .exec()
  ]) as [any[], any[]]

  const timelineAnteriorPorUser = new Map(
    timelinesAnteriores.map((timeline: any) => [String(timeline.userId), timeline])
  )
  const movsPorUser = new Map<string, any[]>()
  for (const m of movimentacoes) {
    const chave = String(m.studentId)
    if (!movsPorUser.has(chave)) movsPorUser.set(chave, [])
    movsPorUser.get(chave)!.push(m)
  }

  // O buraco de calendário é uma afirmação global (não depende apenas das
  // turmas de um aluno). O universo desta corrida já contém todos os alunos
  // com algum dos três espelhos, por isso o inventário pode ser construído
  // uma vez e partilhado por todas as entradas.
  const periodosComTurma = new Set<string>()
  const registarPeriodo = (nome: string | null | undefined) => {
    if (!nome || tipoDeTurma(nome) !== 'renovacao') return
    const periodo = parseTurmaName(nome).periodYYMM
    if (periodo) periodosComTurma.add(periodo)
  }
  for (const user of users) {
    for (const turma of user?.hotmart?.enrolledClasses ?? []) registarPeriodo(turma?.className)
  }
  for (const movimento of movimentacoes) registarPeriodo(movimento.className)

  const porMapear = new Set<string>()
  const ops: any[] = []

  for (const email of emailsAlvo) {
    const user = userPorEmail.get(email)
    if (!user) continue

    try {
      const venda = porEmailVendas.get(email)
      const tag = porEmailTags.get(email)
      const ac = porEmailAc.get(email)
      const timelineAnterior = timelineAnteriorPorUser.get(String(user._id)) as any
      const legadoExpiracaoAncora = ancoraDoEventoLegado(timelineAnterior)
      const entrada = montarEntrada(
        {
          userId: String(user._id),
          email,
          vendas: venda ? { sales: venda.sales ?? [], lastSyncedAt: venda.lastSyncedAt ?? null } : null,
          tags: tag ? { tags: tag.tags ?? [], syncedAt: tag.syncedAt ?? null } : null,
          ac: ac
            ? {
                purchaseDate: ac.purchaseDate ?? null,
                expirationDate: ac.expirationDate ?? null,
                lastSyncedAt: ac.lastSyncedAt ?? null
              }
            : null,
          movimentacoes: (movsPorUser.get(String(user._id)) ?? []).map((m) => ({
            classId: m.classId ?? null,
            className: m.className,
            dateMoved: m.dateMoved ?? null
          })),
          turmaAtual: turmaActualDoUser(user),
          periodosComTurma: [...periodosComTurma].sort()
        },
        excepcoes,
        legadoExpiracaoAncora
      )

      const timeline = gerarTimeline(entrada)
      timeline.turmasPorMapear.forEach((t) => porMapear.add(t))
      if (timeline.ciclos.some((c) => c.alertas.length > 0)) report.comAlertas += 1

      ops.push({
        updateOne: {
          filter: { userId: user._id },
          update: {
            $set: {
              email,
              ciclos: timeline.ciclos,
              tagsOrfas: timeline.tagsOrfas,
              tagsDuplicadas: timeline.tagsDuplicadas,
              tagsEstado: timeline.tagsEstado,
              cadeia: timeline.cadeia,
              turmasPorMapear: timeline.turmasPorMapear,
              geradoEm: agora,
              fontes: entrada.fontes
            }
          },
          upsert: true
        }
      })
    } catch (error: any) {
      report.errors.push({ email, error: error?.message ?? 'erro' })
    }
  }

  if (ops.length) {
    const r = await (StudentRenewalTimeline as any).bulkWrite(ops, { ordered: false })
    report.gerados = (r.upsertedCount ?? 0) + (r.matchedCount ?? 0)
  }

  report.turmasPorMapear = [...porMapear].sort()
  return report
}

/** Regenera a timeline de um aluno só e devolve-a. */
export async function gerarTimelineDeAluno(userId: string): Promise<IStudentRenewalTimeline | null> {
  const user = (await (User as any).findById(userId).select('email').lean().exec()) as
    | { email: string }
    | null
  if (!user?.email) return null

  await gerarTimelinesEmLote([user.email])
  return (await (StudentRenewalTimeline as any)
    .findOne({ userId: new mongoose.Types.ObjectId(userId) })
    .lean()
    .exec()) as IStudentRenewalTimeline | null
}

export default gerarTimelinesEmLote
