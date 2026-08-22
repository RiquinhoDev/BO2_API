// ════════════════════════════════════════════════════════════
// Traz da ActiveCampaign as tags de turma de cada aluno e
// guarda-as em acstudenttags.
//
// LÊ da AC, ESCREVE só na nossa BD. Não cria, altera nem remove
// nada do lado da AC.
//
// Vai por TAG e não por contacto: são ~120 tags contra ~940
// alunos, e uma consulta por tag traz todos os contactos dela de
// uma vez. Também apanha alunos já inactivos, que é o que permite
// depois ver quem ficou com tags de ciclos antigos.
// ════════════════════════════════════════════════════════════

import axios from 'axios'
import mongoose from 'mongoose'
import ACStudentTag, { TipoTagTurma } from '../../models/ACStudentTag'
import { User } from '../../models'

const AC_URL = () => process.env.AC_API_URL || ''
const AC_HEADERS = () => ({ 'Api-Token': process.env.AC_API_KEY || '' })

const normalizar = (s: string) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Tags que dizem em que turma o aluno está.
 * Ex.: "Aluno OGI L2409 - Turma 11", "Aluno OGI 2505 - Renovação Turma 10 [2anos]"
 */
const PADRAO_MEMBRESIA = /^aluno ogi\s+l?\d{4}\s*-\s*(renova(ç|c)(ã|a)o\s+)?turma/i

/** Tags que mencionam turmas sem serem de pertença (mentorias, "25 primeiros", ofertas). */
const MENCIONA_TURMA = /\bturma\b/i
// "Alunos OGI Ativos" falhava com /^aluno ogi\b/ — o `s` do plural
// partia o \b e a tag de estado nunca chegava ao espelho.
const MENCIONA_OGI = /^alunos?\s+ogi\b/i
const MENCIONA_RENOVACAO = /renova(ç|c)(ã|a)o/i

export interface AcStudentTagsSyncReport {
  tagsRelevantes: number
  tagsCanonicas: number
  associacoesLidas: number
  contactosDistintos: number
  contactosComData: number
  /** Quantos contactos exigiram GET /contactTags nesta corrida. */
  contactosConsultados: number
  alunosGravados: number
  semUtilizador: number
  errors: Array<{ contexto: string; error: string }>
}

export function classificar(nome: string, canonicas: Set<string>): TipoTagTurma | null {
  if (canonicas.has(normalizar(nome))) return 'canonica'
  if (PADRAO_MEMBRESIA.test(nome)) return 'membresia'
  if (MENCIONA_TURMA.test(nome) || MENCIONA_OGI.test(nome) || MENCIONA_RENOVACAO.test(nome)) return 'outra'
  return null
}

/**
 * Reaproveita `aplicadaEm` do espelho anterior. Devolve true
 * quando todas as tags actuais ficaram preenchidas e, portanto,
 * não é preciso voltar a consultar este contacto na AC.
 */
export function reutilizarDatasExistentes(
  tagsAtuais: Array<{ tagId: string; aplicadaEm: Date | null }>,
  tagsExistentes: Array<{ tagId: string; aplicadaEm: Date | string | null | undefined }>
): boolean {
  const porId = new Map(tagsExistentes.map((tag) => [String(tag.tagId), tag.aplicadaEm]))
  let completas = true
  for (const tag of tagsAtuais) {
    const valor = porId.get(String(tag.tagId))
    const data = valor ? new Date(valor) : null
    if (data && !Number.isNaN(data.getTime())) {
      tag.aplicadaEm = data
    } else {
      completas = false
    }
  }
  return completas
}

async function todasAsTags(): Promise<Array<{ id: string; tag: string }>> {
  const out: Array<{ id: string; tag: string }> = []
  let offset = 0
  while (true) {
    const r: any = await axios.get(`${AC_URL()}/api/3/tags`, {
      headers: AC_HEADERS(),
      params: { limit: 100, offset },
      timeout: 45000
    })
    const t = r.data?.tags ?? []
    out.push(...t)
    if (t.length < 100) break
    offset += 100
    if (offset > 10000) break
  }
  return out
}

async function contactosDaTag(tagId: string): Promise<Array<{ id: string; email: string }>> {
  const out: Array<{ id: string; email: string }> = []
  let offset = 0
  while (true) {
    const r: any = await axios.get(`${AC_URL()}/api/3/contacts`, {
      headers: AC_HEADERS(),
      params: { tagid: tagId, limit: 100, offset },
      timeout: 45000
    })
    const cs = r.data?.contacts ?? []
    for (const c of cs) {
      const email = String(c.email ?? '').toLowerCase().trim()
      if (email) out.push({ id: String(c.id), email })
    }
    if (cs.length < 100) break
    offset += 100
    if (offset > 20000) break
    await new Promise((r) => setTimeout(r, 100))
  }
  return out
}

/**
 * Datas de aplicação das tags de UM contacto.
 * O varrimento principal vai por tag (`/contacts?tagid=`) porque são
 * ~120 tags contra ~940 alunos — mas essa resposta não traz o `cdate`
 * da associação. Só `/contacts/{id}/contactTags` o traz, e isso é um
 * pedido por contacto. Fica numa passagem à parte, opcional.
 */
async function datasDasTagsDoContacto(contactId: string): Promise<Map<string, Date>> {
  const r: any = await axios.get(`${AC_URL()}/api/3/contacts/${contactId}/contactTags`, {
    headers: AC_HEADERS(),
    timeout: 45000
  })
  const out = new Map<string, Date>()
  for (const ct of r.data?.contactTags ?? []) {
    const d = ct?.cdate ? new Date(ct.cdate) : null
    if (ct?.tag && d && !Number.isNaN(d.getTime())) out.set(String(ct.tag), d)
  }
  return out
}

/**
 * @param tagsCanonicas nomes das tags da tabela oficial, para as marcar como
 *        `canonica`. Sem esta lista tudo o que siga o padrão fica `membresia`.
 */
export async function syncAcStudentTags(
  tagsCanonicas: string[] = [],
  opcoes: { comDatas?: boolean } = {}
): Promise<AcStudentTagsSyncReport> {
  const canonicas = new Set(tagsCanonicas.map(normalizar))

  const report: AcStudentTagsSyncReport = {
    tagsRelevantes: 0,
    tagsCanonicas: 0,
    associacoesLidas: 0,
    contactosDistintos: 0,
    contactosComData: 0,
    contactosConsultados: 0,
    alunosGravados: 0,
    semUtilizador: 0,
    errors: []
  }

  const tags = await todasAsTags()
  const relevantes = tags
    .map((t) => ({ ...t, tipo: classificar(t.tag, canonicas) }))
    .filter((t) => t.tipo !== null) as Array<{ id: string; tag: string; tipo: TipoTagTurma }>

  report.tagsRelevantes = relevantes.length
  report.tagsCanonicas = relevantes.filter((t) => t.tipo === 'canonica').length

  // email -> tags
  const porEmail = new Map<
    string,
    { contactId: string; tags: Array<{ tagId: string; nome: string; tipo: TipoTagTurma; aplicadaEm: Date | null }> }
  >()

  for (const t of relevantes) {
    try {
      const contactos = await contactosDaTag(t.id)
      report.associacoesLidas += contactos.length
      for (const c of contactos) {
        let reg = porEmail.get(c.email)
        if (!reg) {
          reg = { contactId: c.id, tags: [] }
          porEmail.set(c.email, reg)
        }
        if (!reg.tags.some((x) => x.tagId === String(t.id))) {
          reg.tags.push({ tagId: String(t.id), nome: t.tag, tipo: t.tipo, aplicadaEm: null })
        }
      }
    } catch (error: any) {
      report.errors.push({ contexto: `tag ${t.id} "${t.tag}"`, error: error?.message ?? 'erro' })
    }
    await new Promise((r) => setTimeout(r, 80))
  }

  report.contactosDistintos = porEmail.size
  const emails = [...porEmail.keys()]

  if (opcoes.comDatas !== false) {
    const existentes = (await (ACStudentTag as any)
      .find({ email: { $in: emails } })
      .select('email tags.tagId tags.aplicadaEm')
      .lean()
      .exec()) as Array<{
        email: string
        tags: Array<{ tagId: string; aplicadaEm: Date | string | null }>
      }>
    const existentesPorEmail = new Map(
      existentes.map((doc) => [String(doc.email).toLowerCase().trim(), doc.tags ?? []])
    )

    for (const [email, reg] of porEmail) {
      if (reutilizarDatasExistentes(reg.tags, existentesPorEmail.get(email) ?? [])) {
        report.contactosComData += 1
        continue
      }

      report.contactosConsultados += 1
      try {
        const datas = await datasDasTagsDoContacto(reg.contactId)
        for (const tag of reg.tags) tag.aplicadaEm = datas.get(tag.tagId) ?? null
        report.contactosComData += 1
      } catch (error: any) {
        report.errors.push({ contexto: `datas do contacto ${reg.contactId}`, error: error?.message ?? 'erro' })
      }
      // a AC limita a 5 pedidos/s — 200ms deixa margem confortável
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  // ligar ao utilizador da nossa BD
  const users = (await (User as any)
    .find({ email: { $in: emails } })
    .select('_id email')
    .lean()) as Array<{ _id: mongoose.Types.ObjectId; email: string }>
  const userPorEmail = new Map(users.map((u) => [String(u.email).toLowerCase().trim(), u._id]))

  const ops: any[] = []
  for (const [email, reg] of porEmail) {
    const userId = userPorEmail.get(email)
    if (!userId) report.semUtilizador += 1
    ops.push({
      updateOne: {
        filter: { email },
        update: {
          $set: {
            userId: userId ?? null,
            contactId: reg.contactId,
            tags: reg.tags,
            totalTags: reg.tags.length,
            totalMembresia: reg.tags.filter((t) => t.tipo !== 'outra').length,
            syncedAt: new Date()
          }
        },
        upsert: true
      }
    })
  }

  if (ops.length) {
    const r = await (ACStudentTag as any).bulkWrite(ops, { ordered: false })
    report.alunosGravados = (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0)
  }

  return report
}

export default syncAcStudentTags
