// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/acTagWatch.context.ts
// Contexto dos alunos e estado das quatro obrigatórias, usados pela
// vigilância (acTagWatch.service.ts) para saber quem está activo, até
// quando tem acesso e qual é a tag da turma actual de cada um.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import StudentRenewalTimeline from '../../models/StudentRenewalTimeline'
import TurmaTagMap from '../../models/TurmaTagMap'
import { User } from '../../models'
import { resolverTagDaTurma } from './turmaTagResolver'
import { ContextoAluno, FotoTag } from './acTagWatch.regras'
import { TAGS_ESTADO_VIGIADAS, TAGS_OBRIGATORIAS } from './tagsObrigatorias'

export const norm = (s: unknown): string => String(s ?? '').toLowerCase().trim()

export const dataOuNull = (v: unknown): Date | null => {
  if (!v) return null
  const d = new Date(v as string)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface Contexto {
  activos: Set<string>
  userIdPorEmail: Map<string, mongoose.Types.ObjectId>
  tagDaTurma: Map<string, string>
  paraAluno: (email: string) => ContextoAluno
}

export async function construirContexto(): Promise<Contexto> {
  // A coorte é OGI, não "toda a gente activa".
  //
  // `combined.status: ACTIVE` sozinho traz 1.342 pessoas — inclui Clareza e
  // OTF, que não têm nem devem ter tags de OGI. Contá-las dava 552 tags de
  // turma "em falta" onde há 27. São duas coisas: o produto diz QUEM é aluno
  // de OGI, o `combined.status` diz se está activo.
  const produto = (await mongoose.connection
    .collection('products')
    .findOne(
      {
        platform: 'hotmart',
        isActive: true,
        $or: [{ code: /^OGI/i }, { courseCode: /^OGI/i }, { name: /Grande Investimento/i }]
      },
      { projection: { _id: 1 } }
    )) as { _id: mongoose.Types.ObjectId } | null

  if (!produto) throw new Error('Produto OGI activo não encontrado — a coorte ficaria vazia')

  const userProducts = (await mongoose.connection
    .collection('userproducts')
    .find({ platform: 'hotmart', productId: produto._id, status: 'ACTIVE' })
    .project({ userId: 1 })
    .toArray()) as Array<{ userId: mongoose.Types.ObjectId }>

  const users = (await (User as any)
    .find({ _id: { $in: userProducts.map((u) => u.userId) }, 'combined.status': 'ACTIVE' })
    .select('_id email hotmart.enrolledClasses')
    .lean()
    .exec()) as Array<{
      _id: mongoose.Types.ObjectId
      email: string
      hotmart?: { enrolledClasses?: Array<{ className?: string; isActive?: boolean }> }
    }>

  const excepcoesRaw = (await (TurmaTagMap as any)
    .find({})
    .select('classNameNormalizado tagNome')
    .lean()
    .exec()) as Array<{ classNameNormalizado: string; tagNome: string }>
  const excepcoes = new Map(excepcoesRaw.map((m) => [String(m.classNameNormalizado), String(m.tagNome)]))

  const activos = new Set<string>()
  const userIdPorEmail = new Map<string, mongoose.Types.ObjectId>()
  const tagDaTurma = new Map<string, string>()

  for (const u of users) {
    const email = norm(u.email)
    activos.add(email)
    userIdPorEmail.set(email, u._id)

    const turmas = u.hotmart?.enrolledClasses ?? []
    const actual =
      turmas.filter((t) => t?.className && t.isActive !== false).at(-1) ??
      turmas.filter((t) => t?.className).at(-1)
    if (actual?.className) {
      const nome = resolverTagDaTurma(actual.className, excepcoes).tagNome
      if (nome) tagDaTurma.set(email, nome)
    }
  }

  const timelines = (await (StudentRenewalTimeline as any)
    .find({ userId: { $in: [...userIdPorEmail.values()] } })
    .select('email ciclos.periodo ciclos.acessoAte ciclos.compras.reembolsada ciclos.coortes.periodo')
    .lean()
    .exec()) as Array<{
      email: string
      ciclos?: Array<{
        periodo?: string
        acessoAte?: Date
        compras?: Array<{ reembolsada?: boolean }>
        coortes?: Array<{ periodo?: string }>
      }>
    }>

  const porEmail = new Map<string, { acessoAte: Date | null; periodosPagos: Set<string> }>()
  for (const tl of timelines) {
    const periodosPagos = new Set<string>()
    let maior: Date | null = null
    for (const c of tl.ciclos ?? []) {
      const temCompraValida = (c.compras ?? []).some((x) => x?.reembolsada !== true)
      if (temCompraValida) {
        for (const co of c.coortes ?? []) if (co?.periodo) periodosPagos.add(String(co.periodo))
        if (c.periodo) periodosPagos.add(String(c.periodo))
      }
      const ate = dataOuNull(c.acessoAte)
      if (ate && (!maior || ate > maior)) maior = ate
    }
    porEmail.set(norm(tl.email), { acessoAte: maior, periodosPagos })
  }

  const agora = new Date()

  return {
    activos,
    userIdPorEmail,
    tagDaTurma,
    paraAluno(email: string): ContextoAluno {
      const e = norm(email)
      const tl = porEmail.get(e)
      return {
        activo: activos.has(e),
        comAcessoPago: !!tl?.acessoAte && tl.acessoAte > agora,
        acessoAte: tl?.acessoAte ? tl.acessoAte.toISOString().slice(0, 10) : '—',
        periodosPagos: tl?.periodosPagos ?? new Set<string>(),
        tagsPorPeriodo: new Map<string, number>(),
        temTimeline: !!tl
      }
    }
  }
}

export interface EstadoDasQuatro {
  tagTurma: { tem: number; faltam: number }
  tag347: { tem: number; faltam: number }
  tag676: { tem: number; faltam: number }
  lista: { tem: number; faltam: number; porLer: number }
  tag710: { tem: number }
}

export function medirEstado(
  porEmail: Map<string, { contactId: string; tags: FotoTag[] }>,
  naLista: Set<string>,
  listaLida: boolean,
  contexto: Contexto
): EstadoDasQuatro {
  const conta = (predicado: (tags: FotoTag[], email: string) => boolean) => {
    let tem = 0
    for (const email of contexto.activos) {
      if (predicado(porEmail.get(email)?.tags ?? [], email)) tem += 1
    }
    return { tem, faltam: contexto.activos.size - tem }
  }

  const temId = (id: string) => (tags: FotoTag[]) => tags.some((t) => String(t.tagId) === id)

  const lista = { tem: 0, faltam: 0, porLer: 0 }
  for (const email of contexto.activos) {
    if (!listaLida || !porEmail.has(email)) lista.porLer += 1
    else if (naLista.has(email)) lista.tem += 1
    else lista.faltam += 1
  }

  return {
    tagTurma: conta((tags, email) => {
      const alvo = contexto.tagDaTurma.get(email)
      return !!alvo && tags.some((t) => norm(t.nome) === norm(alvo))
    }),
    tag347: conta(temId(TAGS_OBRIGATORIAS[0].id)),
    tag676: conta(temId(TAGS_OBRIGATORIAS[1].id)),
    lista,
    tag710: { tem: conta(temId(TAGS_ESTADO_VIGIADAS[0].id)).tem }
  }
}
