import { gerarTimeline } from '../../src/services/renewal/renewalTimeline.generator'
import { montarEntrada, ancoraDoEventoLegado } from '../../src/services/renewal/renewalTimeline.service'
import { parseTurmaName, tipoDeTurma } from '../../src/services/renewal/turmaParser'
import { canonical, desligar, ligar, turmaActual } from './lib'

async function main() {
  const db = await ligar()
  try {
    const lidosEm = new Date().toISOString()
    const emails = new Set<string>()
    const [vendas, tags, ac] = await Promise.all([
      db.collection('hotmartsalehistories').find({}).toArray(),
      db.collection('acstudenttags').find({}).toArray(),
      db.collection('acrenewaldata').find({}).toArray()
    ])
    for (const row of [...vendas, ...tags, ...ac]) if (row.email) emails.add(row.email)
    const users = await db.collection('users').find({ email: { $in: [...emails] } }).toArray()
    const userByEmail = new Map(users.map((u: any) => [String(u.email).toLowerCase(), u]))
    const userIds = users.map((u) => u._id)
    const histories = await db.collection('studentclasshistories').find({ studentId: { $in: userIds } }).toArray()
    const periodosComTurma = new Set<string>()
    const registarPeriodo = (nome: string | null | undefined) => {
      if (!nome || tipoDeTurma(nome) !== 'renovacao') return
      const periodo = parseTurmaName(nome).periodYYMM
      if (periodo) periodosComTurma.add(periodo)
    }
    for (const user of users) {
      for (const turma of user?.hotmart?.enrolledClasses ?? []) registarPeriodo(turma?.className)
    }
    for (const history of histories) registarPeriodo(history.className)
    const maps = await db.collection('turmatagmap').find({}).project({ classNameNormalizado: 1, tagNome: 1 }).toArray()
    const excecoes = new Map(maps.map((m: any) => [m.classNameNormalizado, m.tagNome]))
    const previous = new Map((await db.collection('studentrenewaltimelines').find({ userId: { $in: userIds } }).project({ userId: 1, ciclos: 1, cadeia: 1 }).toArray()).map((t: any) => [String(t.userId), t]))
    const byEmail = (rows: any[]) => new Map(rows.map((r) => [String(r.email).toLowerCase(), r]))
    const vendasBy = byEmail(vendas), tagsBy = byEmail(tags), acBy = byEmail(ac)
    const historyBy = new Map<string, any[]>()
    for (const h of histories) {
      const key = String(h.studentId)
      historyBy.set(key, [...(historyBy.get(key) ?? []), h])
    }
    let generated = 0
    let different = 0
    const fields = new Set<string>()
    for (const email of emails) {
      const user = userByEmail.get(email)
      if (!user) continue
      const sale = vendasBy.get(email), tag = tagsBy.get(email), acRow = acBy.get(email)
      const anterior = previous.get(String(user._id))
      const entrada = montarEntrada({
        userId: String(user._id), email,
        vendas: sale ? { sales: sale.sales ?? [], lastSyncedAt: sale.lastSyncedAt ?? null } : null,
        tags: tag ? { tags: tag.tags ?? [], syncedAt: tag.syncedAt ?? null } : null,
        ac: acRow ? { purchaseDate: acRow.purchaseDate ?? null, expirationDate: acRow.expirationDate ?? null, lastSyncedAt: acRow.lastSyncedAt ?? null } : null,
        movimentacoes: (historyBy.get(String(user._id)) ?? []).map((h) => ({ classId: h.classId ?? null, className: h.className, dateMoved: h.dateMoved ?? null })),
        turmaAtual: (() => { const nome = turmaActual(user); return nome ? { classId: null, className: nome, entrouEm: null } : null })(),
        periodosComTurma: [...periodosComTurma].sort()
      }, excecoes, ancoraDoEventoLegado(anterior))
      const a = canonical(gerarTimeline(entrada))
      const b = canonical(gerarTimeline(entrada))
      generated += 1
      if (JSON.stringify(a) !== JSON.stringify(b)) different += 1
    }
    console.log(JSON.stringify({ lidosEm, timelinesComparadas: generated, documentosDiferentes: different, camposDiferentes: [...fields] }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
