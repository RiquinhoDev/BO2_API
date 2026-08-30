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
import { getOptionalActiveCampaignCredentials } from '../requestDrivenRuntimeConfig'
import { LISTA_OBRIGATORIA, eTagObrigatoria } from './tagsObrigatorias'

const AC_URL = (): string => getOptionalActiveCampaignCredentials()?.apiUrl ?? ''
const AC_HEADERS = (): { 'Api-Token': string } => ({
  'Api-Token': getOptionalActiveCampaignCredentials()?.apiKey ?? '',
})

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
  /**
   * A leitura da lista "Alunos OGI" correu sem erro. Quando é false,
   * o campo `naListaAlunosOgi` **não** é escrito — senão uma falha de
   * rede parecia milhares de saídas da lista.
   */
  listaLida: boolean
  /** Subscritores da lista obrigatória, de todos os contactos da AC. */
  naLista: number
  alunosGravados: number
  semUtilizador: number
  /**
   * Alunos cujo espelho ficou com zero tags porque deixaram de aparecer no
   * varrimento. Sem isto, quem perde a última tag fica congelado com as
   * antigas e a remoção é invisível.
   */
  esvaziados?: number
  /** Preenchido quando o esvaziamento foi recusado, com a razão. */
  esvaziamentoRecusado?: string
  errors: Array<{ contexto: string; error: string }>
}

/**
 * @param tagId id da tag na AC. As obrigatórias entram por id e não por
 *        padrão: a `OGI - Aluno ou Ex-Aluno` (676) começa por "OGI -" e
 *        falha as três expressões acima, pelo que nunca chegava ao espelho
 *        apesar de ter milhares de contactos. Alargar a expressão traria
 *        dezenas de tags que não queremos; a lista explícita não.
 */
export function classificar(
  nome: string,
  canonicas: Set<string>,
  tagId?: string | number | null
): TipoTagTurma | null {
  if (eTagObrigatoria(tagId)) return 'canonica'
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
 * Emails subscritos numa lista da AC.
 *
 * A quarta obrigatória não é uma tag — é a lista "Alunos OGI". Uma
 * leitura paginada por corrida, nunca um pedido por contacto.
 *
 * Sem filtro de estado: conta-se estar na lista, não estar subscrito às
 * comunicações. Foi assim que os 906 de 914 foram medidos a 27/08.
 */
async function emailsDaLista(listId: string): Promise<Set<string>> {
  const out = new Set<string>()
  let offset = 0
  while (true) {
    const r: any = await axios.get(`${AC_URL()}/api/3/contacts`, {
      headers: AC_HEADERS(),
      params: { listid: listId, limit: 100, offset },
      timeout: 45000
    })
    const cs = r.data?.contacts ?? []
    for (const c of cs) {
      const email = String(c.email ?? '').toLowerCase().trim()
      if (email) out.add(email)
    }
    if (cs.length < 100) break
    offset += 100
    if (offset > 50000) break
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

/** Uma tag do contacto, tal como sai da leitura da AC. */
export interface FotoTag {
  tagId: string
  nome: string
  tipo: TipoTagTurma
  aplicadaEm: Date | null
}

export interface LeituraAc {
  porEmail: Map<string, { contactId: string; tags: FotoTag[] }>
  /** Emails na lista obrigatória. Vazio e `report.listaLida: false` se falhou. */
  naLista: Set<string>
  report: AcStudentTagsSyncReport
}

/**
 * Lê da ActiveCampaign e devolve o que lá está. **Não grava nada** — nem na
 * AC nem na nossa BD.
 *
 * Existe separada do `syncAcStudentTags` porque a vigilância precisa de
 * comparar a AC de hoje com o espelho de ontem, e o espelho é sobrescrito
 * pela escrita. Se as duas coisas acontecerem no mesmo passo, a base de
 * comparação morre antes de ser lida.
 *
 * @param tagsCanonicas nomes das tags da tabela oficial, para as marcar como
 *        `canonica`. Sem esta lista tudo o que siga o padrão fica `membresia`.
 */
export async function lerTagsDaAc(
  tagsCanonicas: string[] = [],
  opcoes: { comDatas?: boolean } = {}
): Promise<LeituraAc> {
  const canonicas = new Set(tagsCanonicas.map(normalizar))

  const report: AcStudentTagsSyncReport = {
    tagsRelevantes: 0,
    tagsCanonicas: 0,
    associacoesLidas: 0,
    contactosDistintos: 0,
    contactosComData: 0,
    contactosConsultados: 0,
    listaLida: false,
    naLista: 0,
    alunosGravados: 0,
    semUtilizador: 0,
    errors: []
  }

  const tags = await todasAsTags()
  const relevantes = tags
    .map((t) => ({ ...t, tipo: classificar(t.tag, canonicas, t.id) }))
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

  // a quarta obrigatória: a lista "Alunos OGI"
  let naLista = new Set<string>()
  try {
    naLista = await emailsDaLista(LISTA_OBRIGATORIA.id)
    report.listaLida = true
    report.naLista = naLista.size
  } catch (error: any) {
    report.errors.push({
      contexto: `lista ${LISTA_OBRIGATORIA.id} "${LISTA_OBRIGATORIA.nome}"`,
      error: error?.message ?? 'erro'
    })
  }

  return { porEmail, naLista, report }
}

/**
 * Lê a AC e actualiza o espelho `acstudenttags`.
 *
 * Escreve APENAS na nossa BD. As chamadas à AC são todas GET.
 */
export async function syncAcStudentTags(
  tagsCanonicas: string[] = [],
  opcoes: { comDatas?: boolean } = {}
): Promise<AcStudentTagsSyncReport> {
  const { porEmail, naLista, report } = await lerTagsDaAc(tagsCanonicas, opcoes)
  const emails = [...porEmail.keys()]

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
    const campos: Record<string, unknown> = {
      userId: userId ?? null,
      contactId: reg.contactId,
      tags: reg.tags,
      totalTags: reg.tags.length,
      totalMembresia: reg.tags.filter((t) => t.tipo !== 'outra').length,
      syncedAt: new Date()
    }
    // Só se escreve a pertença à lista quando a lista foi mesmo lida. Uma
    // falha de rede não pode passar por milhares de saídas da lista.
    if (report.listaLida) campos.naListaAlunosOgi = naLista.has(email)

    ops.push({ updateOne: { filter: { email }, update: { $set: campos }, upsert: true } })
  }

  if (ops.length) {
    const r = await (ACStudentTag as any).bulkWrite(ops, { ordered: false })
    report.alunosGravados = (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0)
  }

  await esvaziarQuemPerdeuTodasAsTags(porEmail, report)

  return report
}

/**
 * Quem deixou de ter QUALQUER tag relevante desaparece do varrimento — e o
 * varrimento só toca nos emails que encontrou. Sem este passo, o espelho de
 * quem perdeu a última tag ficava congelado com as tags antigas para sempre,
 * e a vigilância nunca veria a remoção.
 *
 * Duas travagens, porque isto apaga tags do espelho:
 *
 *  - **Não corre se a leitura teve erros.** Uma tag que falhou por rede leva
 *    consigo todos os seus contactos, e cada um deles pareceria ter perdido
 *    tudo.
 *  - **Não corre acima de 5% dos alunos.** Um aluno a perder as tags todas é
 *    plausível; cinquenta na mesma noite é a API da AC a falhar.
 */
async function esvaziarQuemPerdeuTodasAsTags(
  porEmail: Map<string, unknown>,
  report: AcStudentTagsSyncReport
): Promise<void> {
  if (report.errors.length > 0) {
    report.esvaziados = 0
    report.esvaziamentoRecusado = 'leitura com erros'
    return
  }

  const comTags = (await (ACStudentTag as any)
    .find({ 'tags.0': { $exists: true } })
    .select('email')
    .lean()) as Array<{ email: string }>

  const orfaos = comTags
    .map((doc) => String(doc.email).toLowerCase().trim())
    .filter((email) => !porEmail.has(email))

  if (!orfaos.length) {
    report.esvaziados = 0
    return
  }

  const limite = Math.max(5, Math.floor(comTags.length * 0.05))
  if (orfaos.length > limite) {
    report.esvaziados = 0
    report.esvaziamentoRecusado = `${orfaos.length} alunos perderiam todas as tags, acima do limite de ${limite}`
    return
  }

  const r = await (ACStudentTag as any).updateMany(
    { email: { $in: orfaos } },
    { $set: { tags: [], totalTags: 0, totalMembresia: 0, syncedAt: new Date() } }
  )
  report.esvaziados = r.modifiedCount ?? 0
}

export default syncAcStudentTags
