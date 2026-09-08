// Aplicação da tag da turma na ActiveCampaign.
//
// O mapa guarda excepções; o resolvedor cobre a convenção e nunca cria tags.
// A aplicação só avança depois de confirmar o nome na AC. Por omissão é
// dry-run; a escrita exige `dryRun: false` explícito.

import ACStudentTag from '../../models/ACStudentTag'
import StudentRenewalTimeline from '../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../models/TurmaTagMap'
import User from '../../models/user'
import AcWriteLog from '../../models/renewal/AcWriteLog'
import activeCampaignService from '../activeCampaign/activeCampaignService'
import { normalizarNomeTurma, resolverTagDaTurma, type ResolucaoTag } from './turmaTagResolver'
import { parseTurmaName } from './turmaParser'
import {
  assertMainParityOwnership,
  mainParityLocalMutationStarted,
  mainParityProviderStarted,
  mainParityProviderSucceeded,
} from './mainParityExecution'
import { collectCappedCursor } from './boundedMongoCursor'

const READ_BATCH_SIZE = 200
const MAX_SYNC_ROWS = 20_000

export type TurmaTagMotivo = 'semMapeamento' | 'jaTem' | 'semContacto' | 'aEsperaDeTurma' | 'semCompraValida' | 'tagInexistente' | 'inactivo'

export interface TurmaTagDecision {
  acao: 'aplicar' | 'ignorar'
  motivo: TurmaTagMotivo | null
  tagNome: string | null
  tagId: string | null
}

export interface TurmaTagInput {
  turmaNome: string
  mapa?: { tagNome: string; tagId: string | null } | null
  resolucao?: ResolucaoTag | null
  tags: Array<{ id: string; nome: string }>
  contactId: string | null
  temCompraValida?: boolean
  confirmacaoAc?: boolean
  tagIdConfirmado?: string | null
}

export function decidirTurmaTag(input: TurmaTagInput): TurmaTagDecision {
  const parsed = parseTurmaName(input.turmaNome)
  if (!parsed.periodYYMM) {
    return { acao: 'ignorar', motivo: 'semMapeamento', tagNome: null, tagId: null }
  }
  const tagNome = input.resolucao?.tagNome ?? input.mapa?.tagNome ?? null
  if (!tagNome) {
    return { acao: 'ignorar', motivo: 'semMapeamento', tagNome: null, tagId: null }
  }
  if (input.temCompraValida === false) {
    return { acao: 'ignorar', motivo: 'semCompraValida', tagNome, tagId: null }
  }
  if (!input.contactId) {
    return { acao: 'ignorar', motivo: 'semContacto', tagNome, tagId: input.tagIdConfirmado ?? input.mapa?.tagId ?? null }
  }
  if (input.confirmacaoAc === false) {
    return { acao: 'ignorar', motivo: 'tagInexistente', tagNome, tagId: null }
  }
  const tagId = input.tagIdConfirmado ?? input.mapa?.tagId ?? null
  const nome = normalizarNomeTurma(tagNome)
  const jaTem = input.tags.some((tag) => (tagId && String(tag.id) === String(tagId)) || normalizarNomeTurma(tag.nome) === nome)
  if (jaTem) {
    return { acao: 'ignorar', motivo: 'jaTem', tagNome, tagId }
  }
  if (input.confirmacaoAc === true && !tagId) {
    return { acao: 'ignorar', motivo: 'tagInexistente', tagNome, tagId: null }
  }
  return { acao: 'aplicar', motivo: null, tagNome, tagId }
}

export interface TurmaTagSyncOptions {
  dryRun?: boolean
  emails?: string[]
  manual?: boolean
}

export interface TurmaTagSyncReport {
  dryRun: boolean
  candidatos: number
  aAplicar: number
  aplicadas: number
  jaTem: number
  semMapeamento: number
  aEsperaDeTurma: number
  semContacto: number
  semCompraValida: number
  tagInexistente: number
  inactivos: number
  erros: Array<{ email: string; error: string }>
  recusas: Array<{ email: string; turma: string; motivo: TurmaTagMotivo }>
}

type TimelineDoc = {
  email: string
  userId?: unknown
  ciclos?: Array<{
    turma?: { nome?: string; classId?: string | null; entrouEm?: Date | null } | null
    compras?: Array<{ reembolsada?: boolean }>
  }>
}

type ActiveUserDoc = { _id?: unknown; email?: string }

function idempotencyKey(email: string, turma: string, tagId: string | null, dryRun: boolean): string {
  return `turma-tag:${email}:${normalizarNomeTurma(turma)}:${tagId ?? 'none'}:${dryRun}`
}

async function registar(
  email: string,
  turma: string,
  decision: TurmaTagDecision,
  dryRun: boolean
): Promise<void> {
  try {
    await AcWriteLog.create({
      quando: new Date(),
      servico: 'turmaTag',
      email,
      campo: Number(decision.tagId) || 0,
      antes: null,
      depois: decision.tagId,
      accao: decision.acao === 'aplicar' ? 'escrito' : 'recusado',
      ...(decision.motivo ? { motivo: decision.motivo } : {}),
      dryRun,
      idempotencyKey: idempotencyKey(email, turma, decision.tagId, dryRun),
      tagId: decision.tagId,
      tagNome: decision.tagNome
    })
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) return
    throw error
  }
}

async function aplicarTag(contactId: string, tagId: string): Promise<void> {
  mainParityProviderStarted()
  await activeCampaignService.client.post('/api/3/contactTags', {
    contactTag: { contact: contactId, tag: tagId }
  })
  mainParityProviderSucceeded()
}

export async function syncTurmaTags(opcoes: TurmaTagSyncOptions = {}): Promise<TurmaTagSyncReport> {
  const dryRun = opcoes.dryRun !== false
  const filtro = opcoes.emails?.length
    ? { email: { $in: opcoes.emails.map((email) => email.toLowerCase().trim()) } }
    : {}
  const report: TurmaTagSyncReport = {
    dryRun,
    candidatos: 0,
    aAplicar: 0,
    aplicadas: 0,
    jaTem: 0,
    semMapeamento: 0,
    aEsperaDeTurma: 0,
    semContacto: 0,
    semCompraValida: 0,
    tagInexistente: 0,
    inactivos: 0,
    erros: [],
    recusas: []
  }

  const [timelines, mapas, tags] = await Promise.all([
    collectCappedCursor(StudentRenewalTimeline.find(filtro).select('userId email ciclos').sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE }), MAX_SYNC_ROWS, 'AC_TURMA_TIMELINES') as Promise<TimelineDoc[]>,
    collectCappedCursor(TurmaTagMap.find({}).select('classNameNormalizado tagNome').sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE }), MAX_SYNC_ROWS, 'AC_TURMA_MAPS') as Promise<Array<{ classNameNormalizado: string; tagNome: string }>>,
    collectCappedCursor(ACStudentTag.find(filtro).select('email contactId tags').sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE }), MAX_SYNC_ROWS, 'AC_TURMA_TAGS') as Promise<Array<{ email: string; contactId?: string; tags?: Array<{ tagId: string; nome: string }> }>>
  ])
  const idsDasTimelines = timelines.map((timeline) => timeline.userId).filter(Boolean)
  const utilizadores: Array<ActiveUserDoc & { combined?: { status?: string } }> = []
  if (idsDasTimelines.length) {
    for (let offset = 0; offset < idsDasTimelines.length; offset += READ_BATCH_SIZE) {
      const ids = idsDasTimelines.slice(offset, offset + READ_BATCH_SIZE)
      utilizadores.push(...await collectCappedCursor(User.find({ _id: { $in: ids } }).select('_id email combined.status').sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE }), READ_BATCH_SIZE, 'AC_TURMA_USERS') as typeof utilizadores)
    }
  } else {
    utilizadores.push(...await collectCappedCursor(User.find(filtro).select('_id email combined.status').sort({ _id: 1 }).maxTimeMS(5_000).lean().cursor({ batchSize: READ_BATCH_SIZE }), MAX_SYNC_ROWS, 'AC_TURMA_USERS') as typeof utilizadores)
  }
  const excepcoesPorTurma = new Map(mapas.map((mapa) => [normalizarNomeTurma(mapa.classNameNormalizado), mapa.tagNome]))
  const tagsPorEmail = new Map(tags.map((doc) => [String(doc.email).toLowerCase().trim(), doc]))
  const utilizadoresPorId = new Map(utilizadores.map((utilizador) => [String(utilizador._id), utilizador]))
  const utilizadoresPorEmail = new Map(utilizadores.map((utilizador) => [String(utilizador.email ?? '').toLowerCase().trim(), utilizador]))

  for (const timeline of timelines) {
    const ciclo = [...(timeline.ciclos ?? [])].reverse().find((item) => item.turma)
    if (!ciclo?.turma?.nome) continue
    const email = timeline.email.toLowerCase().trim()
    report.candidatos += 1
    const tagDoc = tagsPorEmail.get(email)
    const temCompraValida = (ciclo.compras ?? []).some((compra) => compra.reembolsada !== true)
    const utilizador = timeline.userId
      ? utilizadoresPorId.get(String(timeline.userId))
      : utilizadoresPorEmail.get(email)
    const activo = utilizador?.combined?.status === 'ACTIVE'
    const entradaDecision: TurmaTagInput = {
      turmaNome: ciclo.turma.nome,
      resolucao: resolverTagDaTurma(ciclo.turma.nome, excepcoesPorTurma),
      tags: (tagDoc?.tags ?? []).map((tag) => ({ id: String(tag.tagId), nome: tag.nome })),
      contactId: tagDoc?.contactId ? String(tagDoc.contactId) : null,
      temCompraValida
    }
    let decision = decidirTurmaTag(entradaDecision)
    try {
      if (!activo && decision.acao === 'aplicar') {
        decision = { acao: 'ignorar', motivo: 'inactivo', tagNome: decision.tagNome, tagId: null }
      } else if (decision.acao === 'aplicar' && decision.tagNome) {
        const tagId = await activeCampaignService.findExistingTagByName(decision.tagNome)
        decision = decidirTurmaTag({ ...entradaDecision, confirmacaoAc: Boolean(tagId), tagIdConfirmado: tagId })
      }
      if (!dryRun) {
        mainParityLocalMutationStarted()
        assertMainParityOwnership()
        await registar(email, ciclo.turma.nome, decision, dryRun)
      }
      if (decision.acao === 'aplicar') {
        report.aAplicar += 1
        if (!dryRun) {
          assertMainParityOwnership()
          await aplicarTag(String(tagDoc!.contactId), String(decision.tagId))
          report.aplicadas += 1
        }
        continue
      }
      if (decision.motivo === 'jaTem') report.jaTem += 1
      if (decision.motivo === 'semMapeamento') report.semMapeamento += 1
      if (decision.motivo === 'aEsperaDeTurma') report.aEsperaDeTurma += 1
      if (decision.motivo === 'semContacto') report.semContacto += 1
      if (decision.motivo === 'semCompraValida') report.semCompraValida += 1
      if (decision.motivo === 'tagInexistente') report.tagInexistente += 1
      if (decision.motivo === 'inactivo') report.inactivos += 1
      if (decision.motivo) report.recusas.push({ email, turma: ciclo.turma.nome, motivo: decision.motivo })
    } catch (error: unknown) {
      report.erros.push({ email, error: error instanceof Error ? error.message : 'erro' })
    }
  }
  return report
}

export default syncTurmaTags
