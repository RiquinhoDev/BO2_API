/**
 * Mede o efeito da janela de fronteira sem escrever timelines.
 *
 * A corrida compara exactamente as mesmas entradas com 3, 5 e 7 dias. O
 * resultado declara a hora da leitura e quantos veredictos mudariam face ao
 * valor operacional proposto (5), para a decisão não ficar escondida num
 * número fixo no código.
 */
import { gerarTimeline } from '../../src/services/renewal/renewalTimeline.generator'
import { ancoraDoEventoLegado, montarEntrada } from '../../src/services/renewal/renewalTimeline.service'
import { parseTurmaName, tipoDeTurma } from '../../src/services/renewal/turmaParser'
import { activosOgi, desligar, ligar, turmaActual } from './lib'

type Veredicto = 'ok' | 'legado' | 'divergente' | 'sem-dados'
type Contagem = Record<Veredicto, number>

const vazia = (): Contagem => ({ ok: 0, legado: 0, divergente: 0, 'sem-dados': 0 })

const contar = (veredictos: Map<string, Veredicto>): Contagem => {
  const out = vazia()
  for (const veredicto of veredictos.values()) out[veredicto] += 1
  return out
}

const porEmail = (rows: any[]) => new Map(rows.map((row) => [String(row.email).toLowerCase().trim(), row]))

async function main() {
  const lidosEm = new Date().toISOString()
  const db = await ligar()
  try {
    const { users, timelines } = await activosOgi(db)
    const ids = users.map((user: any) => user._id)
    const emails = users.map((user: any) => String(user.email).toLowerCase().trim())
    const [vendas, tags, ac, histories, maps] = await Promise.all([
      db.collection('hotmartsalehistories').find({ email: { $in: emails } }).toArray(),
      db.collection('acstudenttags').find({ email: { $in: emails } }).toArray(),
      db.collection('acrenewaldata').find({ email: { $in: emails } }).toArray(),
      db.collection('studentclasshistories').find({ studentId: { $in: ids } }).toArray(),
      db.collection('turmatagmap').find({}).project({ classNameNormalizado: 1, tagNome: 1 }).toArray()
    ])
    const vendasBy = porEmail(vendas)
    const tagsBy = porEmail(tags)
    const acBy = porEmail(ac)
    const previous = new Map(timelines.map((timeline: any) => [String(timeline.userId), timeline]))
    const historiesBy = new Map<string, any[]>()
    const periodosComTurma = new Set<string>()
    const registarPeriodo = (nome: string | null | undefined) => {
      if (!nome || tipoDeTurma(nome) !== 'renovacao') return
      const periodo = parseTurmaName(nome).periodYYMM
      if (periodo) periodosComTurma.add(periodo)
    }
    for (const user of users) {
      for (const turma of user?.hotmart?.enrolledClasses ?? []) registarPeriodo(turma?.className)
    }
    for (const history of histories) {
      const key = String(history.studentId)
      historiesBy.set(key, [...(historiesBy.get(key) ?? []), history])
      registarPeriodo(history.className)
    }
    const excepcoes = new Map(maps.map((map: any) => [map.classNameNormalizado, map.tagNome]))
    const porJanela = new Map<number, Map<string, Veredicto>>()

    for (const janela of [3, 5, 7]) {
      const veredictos = new Map<string, Veredicto>()
      for (const user of users) {
        const email = String(user.email).toLowerCase().trim()
        const venda = vendasBy.get(email)
        const tag = tagsBy.get(email)
        const acRow = acBy.get(email)
        const entrada = montarEntrada({
          userId: String(user._id),
          email,
          vendas: venda ? { sales: venda.sales ?? [], lastSyncedAt: venda.lastSyncedAt ?? null } : null,
          tags: tag ? { tags: tag.tags ?? [], syncedAt: tag.syncedAt ?? null } : null,
          ac: acRow ? { purchaseDate: acRow.purchaseDate ?? null, expirationDate: acRow.expirationDate ?? null, lastSyncedAt: acRow.lastSyncedAt ?? null } : null,
          movimentacoes: (historiesBy.get(String(user._id)) ?? []).map((history) => ({ classId: history.classId ?? null, className: history.className, dateMoved: history.dateMoved ?? null })),
          turmaAtual: (() => { const nome = turmaActual(user); return nome ? { classId: null, className: nome, entrouEm: null } : null })(),
          periodosComTurma: [...periodosComTurma].sort(),
          janelaCampanhaDias: janela
        }, excepcoes, ancoraDoEventoLegado(previous.get(String(user._id))))
        veredictos.set(String(user._id), gerarTimeline(entrada).cadeia.expiracaoIgualTurma as Veredicto)
      }
      porJanela.set(janela, veredictos)
    }

    const base = porJanela.get(5)!
    const mudam = (janela: number) => [...base].filter(([id, veredicto]) => porJanela.get(janela)!.get(id) !== veredicto).length
    console.log(JSON.stringify({
      lidosEm,
      populacao: users.length,
      janelas: [3, 5, 7].map((dias) => ({ dias, contagem: contar(porJanela.get(dias)!) })),
      mudamFaceA5Dias: { tresDias: mudam(3), seteDias: mudam(7) },
      nota: 'A comparação é read-only; a janela operacional proposta é 5 dias.'
    }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
