// ════════════════════════════════════════════════════════════
// 📁 scripts/dry-run-timeline.ts
// Corre o gerador contra alunos reais e imprime o resultado.
// NÃO escreve nada: usa o gerador directamente, não o bulkWrite.
// ════════════════════════════════════════════════════════════

import mongoose from 'mongoose'
import { montarEntrada, carregarExcepcoes } from '../src/services/renewal/renewalTimeline.service'
import { gerarTimeline } from '../src/services/renewal/renewalTimeline.generator'
import HotmartSaleHistory from '../src/models/HotmartSaleHistory'
import ACStudentTag from '../src/models/ACStudentTag'
import ACRenewalData from '../src/models/ACRenewalData'
import StudentClassHistory from '../src/models/StudentClassHistory'
import { User } from '../src/models'

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || ''
  if (!mongoUri) throw new Error('MONGO_URI ou MONGODB_URI não definido')

  const emails = process.argv.slice(2).map((e) => e.toLowerCase().trim()).filter(Boolean)
  if (!emails.length) throw new Error('uso: dry-run-timeline.ts <email> [email...]')

  await mongoose.connect(mongoUri)
  const excepcoes = await carregarExcepcoes()

  for (const email of emails) {
    const [venda, tag, ac, user] = await Promise.all([
      (HotmartSaleHistory as any).findOne({ email }).lean(),
      (ACStudentTag as any).findOne({ email }).lean(),
      (ACRenewalData as any).findOne({ email }).lean(),
      (User as any).findOne({ email }).select('_id email hotmart.enrolledClasses').lean()
    ])
    if (!user) {
      console.log(`\n${email}: sem utilizador na BD`)
      continue
    }

    const movs = await (StudentClassHistory as any).find({ studentId: user._id }).lean()
    const turmas = (user.hotmart?.enrolledClasses ?? []).filter((t: any) => t?.className)
    const activas = turmas.filter((t: any) => t?.isActive !== false)
    const actual = activas[activas.length - 1] ?? turmas[turmas.length - 1] ?? null

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
        movimentacoes: movs.map((m: any) => ({
          classId: m.classId ?? null,
          className: m.className,
          dateMoved: m.dateMoved ?? null
        })),
        turmaAtual: actual
          ? { classId: actual.classId ?? null, className: actual.className, entrouEm: actual.enrolledAt ?? null }
          : null
      },
      excepcoes
    )

    const timeline = gerarTimeline(entrada)
    console.log(`\n══ ${email} ══`)
    console.log('cadeia:', timeline.cadeia)
    for (const ciclo of timeline.ciclos) {
      const compras = ciclo.compras
        .map((x) => `${x.data.toISOString().slice(0, 10)} ${x.valor ?? '—'}${x.moeda ?? ''}`)
        .join(' + ')
      console.log(
        `  ${ciclo.periodo}  ${compras}  ${ciclo.anos}a  acesso até ${ciclo.acessoAte.toISOString().slice(0, 10)}`
      )
      for (const coorte of ciclo.coortes) {
        console.log(`         coorte ${coorte.ano} (${coorte.periodo}): ${coorte.tag?.nome ?? '—'}`)
      }
      console.log(`         esperada: ${ciclo.tagEsperada ?? '?'}`)
      console.log(`         turma:    ${ciclo.turma?.nome ?? '—'}`)
      if (ciclo.alertas.length) console.log(`         ⚠ ${ciclo.alertas.join(', ')}`)
    }
    if (timeline.tagsOrfas.length) {
      console.log('  órfãs:', timeline.tagsOrfas.map((x) => x.nome).join(' | '))
    }
    if (timeline.tagsDuplicadas.length) {
      console.log(
        '  duplicadas:',
        timeline.tagsDuplicadas.map((x) => `${x.nome} → coorte ${x.coortePeriodo}`).join(' | ')
      )
    }
    if (timeline.tagsEstado.length) {
      console.log('  estado:', timeline.tagsEstado.map((x) => x.nome).join(' | '))
    }
    if (timeline.turmasPorMapear.length) {
      console.log('  por mapear:', timeline.turmasPorMapear.join(' | '))
    }
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
