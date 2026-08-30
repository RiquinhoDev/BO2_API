/**
 * Compara uma fotografia do espelho `acstudenttags` com o que lá está agora,
 * e diz o que mexeu. É o protótipo do `AcTagWatch`: as mesmas regras, corridas
 * à mão, para se ver o que a vigilância apanharia antes de a construir.
 *
 * Só lê. Não escreve em lado nenhum — nem na AC nem na nossa BD.
 *
 * Uso:
 *   railway run npx tsx scripts/qualidade/diff-espelho-tags.ts <fotografia.json>
 */
import fs from 'fs'
import { desligar, ligar, turmaActual } from './lib'
import { TAGS_OBRIGATORIAS, eTagObrigatoria } from '../../src/services/renewal/tagsObrigatorias'
import { resolverTagDaTurma } from '../../src/services/renewal/turmaTagResolver'

const LIMIAR_LOTE = 10

interface TagFoto {
  tagId: string
  nome: string
  tipo: string
  aplicadaEm: string | Date | null
}
interface DocFoto {
  email: string
  syncedAt?: string | Date
  tags?: TagFoto[]
  naListaAlunosOgi?: boolean | null
}

interface Evento {
  email: string
  tagId: string
  tagNome: string
  tipo: string
  accao: 'aplicada' | 'removida'
  quando: Date | null
  activo: boolean
  noEscopo: boolean
  porqueEscopo: string
  lote: string | null
  loteTamanho: number
  origem: 'nosso' | 'automacaoAC' | 'maoHumana'
}

const chaveLote = (tagId: string, quando: Date | null): string | null => {
  if (!quando || Number.isNaN(quando.getTime())) return null
  const m = new Date(quando)
  m.setSeconds(0, 0)
  return `${tagId}|${m.toISOString()}`
}

const dataOuNull = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

async function main() {
  const caminho = process.argv[2]
  if (!caminho) throw new Error('falta o caminho da fotografia')
  const antes: DocFoto[] = JSON.parse(fs.readFileSync(caminho, 'utf8'))
  const db: any = await ligar()

  const agora: DocFoto[] = await db
    .collection('acstudenttags')
    .find({})
    .project({ email: 1, syncedAt: 1, tags: 1, naListaAlunosOgi: 1 })
    .toArray()

  const norm = (e: string) => String(e).toLowerCase().trim()
  const mapaAntes = new Map(antes.map((d) => [norm(d.email), d]))
  const mapaAgora = new Map(agora.map((d) => [norm(d.email), d]))

  // ── coorte OGI activa e a turma actual de cada um ─────────────────
  const produto = await db.collection('products').findOne(
    { platform: 'hotmart', isActive: true, $or: [{ code: /^OGI/i }, { name: /Grande Investimento/i }] },
    { projection: { _id: 1 } }
  )
  const ups = await db
    .collection('userproducts')
    .find({ platform: 'hotmart', productId: produto._id, status: 'ACTIVE' })
    .project({ userId: 1 })
    .toArray()
  const users = await db
    .collection('users')
    .find({ _id: { $in: ups.map((u: any) => u.userId) } })
    .project({ email: 1, hotmart: 1 })
    .toArray()

  const excepcoes = new Map<string, string>(
    (await db.collection('turmatagmap').find({}).toArray()).map((m: any) => [
      String(m.classNameNormalizado ?? ''),
      String(m.tagNome ?? '')
    ])
  )

  const activos = new Set<string>()
  const tagDaTurmaPorEmail = new Map<string, string>()
  for (const u of users) {
    const email = norm(u.email)
    activos.add(email)
    const turma = turmaActual(u)
    if (turma) {
      const nome = resolverTagDaTurma(turma, excepcoes).tagNome
      if (nome) tagDaTurmaPorEmail.set(email, nome.toLowerCase().trim())
    }
  }

  // ── o que é "primeira leitura" e o que é aplicação a sério ────────
  //
  // Uma tag ausente da fotografia e presente agora tem duas explicações
  // opostas, e a diferença entre elas é a data de aplicação:
  //
  //   cdate ANTES da fotografia   -> o espelho é que não a via.  Não é evento.
  //                                  Foi o caso da 676, com cdates de anos.
  //   cdate DEPOIS da fotografia  -> aconteceu mesmo.            É evento.
  //                                  Foi o caso da 710: 36 contactos em 6
  //                                  segundos na manhã de 30/08.
  //
  // Assumir que a ausência da fotografia basta esconde exactamente os
  // eventos que interessam.
  const fotoEm = (() => {
    const datas = antes.map((d) => dataOuNull(d.syncedAt)).filter(Boolean) as Date[]
    return datas.sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  })()

  const idsNaFoto = new Set<string>()
  for (const d of antes) for (const t of d.tags ?? []) idsNaFoto.add(String(t.tagId))

  /** True quando a associação já lá estava e o espelho é que não a via. */
  const soAgoraVisivel = (t: TagFoto): boolean => {
    if (idsNaFoto.has(String(t.tagId))) return false
    const quando = dataOuNull(t.aplicadaEm)
    if (!quando || !fotoEm) return true
    return quando <= fotoEm
  }

  // ── o diff ────────────────────────────────────────────────────────
  const eventos: Evento[] = []
  const soVisiveis = new Map<string, number>()
  const todosOsEmails = new Set([...mapaAntes.keys(), ...mapaAgora.keys()])

  for (const email of todosOsEmails) {
    const a = mapaAntes.get(email)?.tags ?? []
    const b = mapaAgora.get(email)?.tags ?? []
    const idsA = new Set(a.map((t) => String(t.tagId)))
    const idsB = new Set(b.map((t) => String(t.tagId)))
    const activo = activos.has(email)
    const tagTurma = tagDaTurmaPorEmail.get(email) ?? null

    const escopo = (t: TagFoto): { dentro: boolean; porque: string } => {
      if (eTagObrigatoria(t.tagId)) return { dentro: true, porque: 'obrigatoria' }
      if (tagTurma && String(t.nome).toLowerCase().trim() === tagTurma) {
        return { dentro: true, porque: 'turma-actual' }
      }
      return { dentro: false, porque: t.tipo === 'membresia' ? 'turma-antiga' : 'fora-do-escopo' }
    }

    for (const t of b) {
      if (idsA.has(String(t.tagId))) continue
      if (soAgoraVisivel(t)) {
        soVisiveis.set(String(t.tagId), (soVisiveis.get(String(t.tagId)) ?? 0) + 1)
        continue
      }
      const e = escopo(t)
      eventos.push({
        email, tagId: String(t.tagId), tagNome: t.nome, tipo: t.tipo,
        accao: 'aplicada', quando: dataOuNull(t.aplicadaEm), activo,
        noEscopo: e.dentro, porqueEscopo: e.porque,
        lote: null, loteTamanho: 1, origem: 'maoHumana'
      })
    }
    for (const t of a) {
      if (idsB.has(String(t.tagId))) continue
      const e = escopo(t)
      eventos.push({
        email, tagId: String(t.tagId), tagNome: t.nome, tipo: t.tipo,
        accao: 'removida', quando: dataOuNull(mapaAntes.get(email)?.syncedAt), activo,
        noEscopo: e.dentro, porqueEscopo: e.porque,
        lote: null, loteTamanho: 1, origem: 'maoHumana'
      })
    }
  }

  // ── lotes, limiar 10: agrupa a vista, nunca colapsa dados ─────────
  //
  // As aplicações têm hora da AC e agrupam-se ao minuto. As remoções NÃO
  // TÊM HORA — a AC não guarda lápide —, portanto agrupá-las ao minuto é
  // fingir precisão que não existe: ficariam todas no mesmo lote só por
  // partilharem a hora da fotografia. Agrupam-se por tag, dentro da janela
  // entre as duas leituras, que é tudo o que se sabe.
  const contagem = new Map<string, number>()
  const chaveDe = (e: Evento): string | null =>
    e.accao === 'aplicada' ? chaveLote(e.tagId, e.quando) : `removida|${e.tagId}`

  for (const e of eventos) {
    const k = chaveDe(e)
    if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  for (const e of eventos) {
    const k = chaveDe(e)
    const n = k ? contagem.get(k) ?? 0 : 0
    if (n >= LIMIAR_LOTE) {
      e.lote = k
      e.loteTamanho = n
      e.origem = 'automacaoAC'
    }
  }

  // ── subtrair o que fomos nós ──────────────────────────────────────
  const nossas = await db
    .collection('acwritelogs')
    .find({ dryRun: false, servico: { $in: ['turmaTag', 'reembolso'] } })
    .toArray()
  const chavesNossas = new Set(nossas.map((l: any) => `${norm(l.email)}|${String(l.tagId ?? '')}`))
  for (const e of eventos) {
    if (chavesNossas.has(`${e.email}|${e.tagId}`)) e.origem = 'nosso'
  }

  // ── relatório ─────────────────────────────────────────────────────
  const dentro = eventos.filter((e) => e.noEscopo)
  const fora = eventos.filter((e) => !e.noEscopo)
  const p = (n: number) => String(n).padStart(6)

  console.log(`fotografia   ${antes.length} docs   de ${fotoEm?.toISOString()}`)
  console.log(`agora        ${agora.length} docs   de ${mapaAgora.values().next().value?.syncedAt}`)
  console.log(`alunos OGI activos ${activos.size}`)
  if (soVisiveis.size) {
    console.log('\ntags que o espelho passou a ver, com aplicacao anterior a fotografia')
    console.log('(nao sao eventos -- so mudou quem as le)')
    for (const [id, n] of soVisiveis) {
      const nome = agora
        .flatMap((d) => d.tags ?? [])
        .find((t) => String(t.tagId) === id)?.nome
      console.log(`  ${id.padStart(5)}  ${String(n).padStart(5)} associacoes  ${nome}`)
    }
  }
  console.log('')

  console.log('                       eventos   activos   inactivos')
  const linha = (nome: string, lista: Evento[]) =>
    console.log(
      `${nome.padEnd(22)}${p(lista.length)}${p(lista.filter((e) => e.activo).length)}${p(
        lista.filter((e) => !e.activo).length
      )}`
    )
  linha('NO ESCOPO', dentro)
  linha('  aplicadas', dentro.filter((e) => e.accao === 'aplicada'))
  linha('  removidas', dentro.filter((e) => e.accao === 'removida'))
  linha('fora do escopo', fora)

  console.log('\nno escopo, por origem')
  for (const o of ['nosso', 'automacaoAC', 'maoHumana'] as const) {
    linha(`  ${o}`, dentro.filter((e) => e.origem === o))
  }

  console.log('\nfora do escopo, porquê')
  for (const razao of ['turma-antiga', 'fora-do-escopo']) {
    linha(`  ${razao}`, fora.filter((e) => e.porqueEscopo === razao))
  }

  const lotes = new Map<string, Evento[]>()
  for (const e of eventos) if (e.lote) {
    if (!lotes.has(e.lote)) lotes.set(e.lote, [])
    lotes.get(e.lote)!.push(e)
  }
  console.log(`\nlotes (limiar ${LIMIAR_LOTE}): ${lotes.size}`)
  for (const [, evs] of lotes) {
    console.log(`  ${String(evs.length).padStart(4)}  ${evs[0].tagNome}  ${evs[0].quando?.toISOString()}`)
  }

  console.log('\n── eventos no escopo, em alunos activos ──')
  const paraVer = dentro.filter((e) => e.activo && !e.lote)
  if (!paraVer.length) console.log('  nenhum')
  for (const e of paraVer.sort((x, y) => x.email.localeCompare(y.email))) {
    const q = e.quando ? e.quando.toISOString().slice(0, 16) : '—'
    console.log(`  ${e.accao.padEnd(9)} ${e.email.padEnd(34)} ${q}  ${e.tagNome}`)
  }

  // ── estado das quatro obrigatórias, agora ─────────────────────────
  console.log('\n── estado das quatro, em alunos OGI activos ──')
  for (const t of TAGS_OBRIGATORIAS) {
    let tem = 0
    for (const email of activos) {
      if ((mapaAgora.get(email)?.tags ?? []).some((x) => String(x.tagId) === t.id)) tem++
    }
    console.log(`  ${t.nome.padEnd(26)} ${p(tem)} têm  ${p(activos.size - tem)} faltam`)
  }
  let comTurma = 0
  for (const email of activos) {
    const alvo = tagDaTurmaPorEmail.get(email)
    if (alvo && (mapaAgora.get(email)?.tags ?? []).some((x) => String(x.nome).toLowerCase().trim() === alvo)) comTurma++
  }
  console.log(`  ${'tag da turma actual'.padEnd(26)} ${p(comTurma)} têm  ${p(activos.size - comTurma)} faltam`)

  let naLista = 0
  let listaPorLer = 0
  for (const email of activos) {
    const v = mapaAgora.get(email)?.naListaAlunosOgi
    if (v === true) naLista++
    else if (v === null || v === undefined) listaPorLer++
  }
  console.log(
    `  ${'lista "Alunos OGI"'.padEnd(26)} ${p(naLista)} têm  ${p(
      activos.size - naLista - listaPorLer
    )} faltam  ${p(listaPorLer)} por ler`
  )

  await desligar()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
