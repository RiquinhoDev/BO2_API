import { fetchSalesForEmail } from '../../src/services/renewal/hotmartSalesHistory.service'
import { getHotmartAccessToken } from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import activeCampaignService from '../../src/services/activeCampaign/activeCampaignService'
import { activosOgi, desligar, ligar } from './lib'

const CAMPO_EXPIRACAO = 332
const CAMPO_COMPRA = 334
const dia = (value: unknown): string | null => {
  if (!value) return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const setVendas = (sales: any[]) => new Set(sales.map((s) => s.transaction ?? `${s.hotmartProductId}|${s.approvedDate ?? s.orderDate}|${s.priceValue}`))
const ehTagRelevante = (nome: string) =>
  /^aluno ogi\s+l?\d{4}\s*-\s*(renova(c|ç)(a|ã)o\s+)?turma/i.test(nome) ||
  /\bturma\b/i.test(nome) ||
  /^alunos?\s+ogi\b/i.test(nome) ||
  /renova(c|ç)(a|ã)o/i.test(nome)

async function main() {
  const db = await ligar()
  try {
    const lidosEm = new Date().toISOString()
    const { userProducts, users } = await activosOgi(db)
    const usersById = new Map(users.map((u) => [String(u._id), u]))
    const ids = userProducts.map((u) => u.userId)
    const [localSales, localAc, localTags] = await Promise.all([
      db.collection('hotmartsalehistories').find({ userId: { $in: ids } }).toArray(),
      db.collection('acrenewaldata').find({ userId: { $in: ids } }).toArray(),
      db.collection('acstudenttags').find({ userId: { $in: ids } }).toArray()
    ])
    const localSalesBy = new Map(localSales.map((row: any) => [String(row.userId), row]))
    const localAcBy = new Map(localAc.map((row: any) => [String(row.userId), row]))
    const localTagsBy = new Map(localTags.map((row: any) => [String(row.userId), row]))
    const sample = users
      .filter((u) => ids.some((id) => String(id) === String(u._id)))
      .sort((a, b) => String(a.email).localeCompare(String(b.email)))
      .slice(0, 40)
    const token = await getHotmartAccessToken()
    const divergencias: Record<string, number> = { hotmartVendas: 0, acExpiracao: 0, acCompra: 0, acTags: 0 }
    let falhasApi = 0
    for (const user of sample) {
      try {
        const live = await fetchSalesForEmail(token, String(user.email))
        const local = localSalesBy.get(String(user._id))?.sales ?? []
        if (JSON.stringify([...setVendas(local)].sort()) !== JSON.stringify([...setVendas(live.sales)].sort())) divergencias.hotmartVendas += 1

        // Sem userId: getContactFieldValues pode guardar metadata.activeCampaignId;
        // uma medição de qualidade tem de ser totalmente read-only.
        const ac = await activeCampaignService.getContactFieldValues(String(user.email), undefined, [CAMPO_EXPIRACAO, CAMPO_COMPRA])
        const localAcRow = localAcBy.get(String(user._id))
        if (dia(ac?.values?.[CAMPO_EXPIRACAO]) !== dia(localAcRow?.expirationDate)) divergencias.acExpiracao += 1
        if (dia(ac?.values?.[CAMPO_COMPRA]) !== dia(localAcRow?.purchaseDate)) divergencias.acCompra += 1

        const liveTags = new Set((await activeCampaignService.getContactTagsByEmail(String(user.email)))
          .map((tag: any) => typeof tag === 'string' ? tag : tag.name)
          .filter((tag): tag is string => Boolean(tag) && ehTagRelevante(tag))
          .sort())
        const localTagNames = new Set((localTagsBy.get(String(user._id))?.tags ?? []).map((tag: any) => tag.nome).filter(Boolean).sort())
        if (JSON.stringify([...liveTags]) !== JSON.stringify([...localTagNames])) divergencias.acTags += 1
      } catch {
        falhasApi += 1
      }
    }
    const latest = (rows: any[], field: string) => rows.map((r) => r[field]).filter(Boolean).sort().at(-1) ?? null
    const coberturaPercent = sample.length / users.length * 100
    console.log(JSON.stringify({
      lidosEm,
      criterioAmostra: '40 primeiros emails em ordem lexicográfica entre UserProduct OGI/Hotmart ACTIVE com User resolvido',
      populacaoResolvida: users.length,
      amostrados: sample.length,
      margem: {
        coberturaPercent,
        foraDaAmostraPercent: 100 - coberturaPercent,
        nota: 'A amostra observa 40/911; até 95,61% da população pode passar despercebida.'
      },
      falhasApi,
      divergencias,
      ultimaSyncVendas: latest(localSales, 'lastSyncedAt'),
      ultimaSyncTags: latest(localTags, 'syncedAt')
    }, null, 2))
  } finally {
    await desligar()
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
