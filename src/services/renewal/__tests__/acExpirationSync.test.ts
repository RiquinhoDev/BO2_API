import assert from 'node:assert/strict'
import { test } from 'node:test'
import mongoose from 'mongoose'
import ACRenewalData from '../../../models/ACRenewalData'
import HotmartSaleHistory from '../../../models/HotmartSaleHistory'
import RenewalOffer from '../../../models/RenewalOffer'
import { activeCampaignService } from '../../activeCampaign/activeCampaignService'
import * as acExpirationSync from '../acExpirationSync.service'
import { TURMA_1_RENEWAL_OFFER_CODE, TURMA_2_RENEWAL_OFFER_CODE } from '../renewalConstants'
import type { VendaEntrada } from '../renewalTimeline.types'

const venda = (partial: Partial<VendaEntrada>): VendaEntrada => ({
  hotmartProductId: '1733154',
  productName: 'O Grande Investimento',
  transaction: null,
  offerCode: null,
  transactionStatus: 'APPROVED',
  approvedDate: null,
  orderDate: null,
  priceValue: 99,
  currency: 'EUR',
  ...partial
})

const dataBaseDoAluno = (acExpirationSync as unknown as { dataBaseDoAluno: (sales: VendaEntrada[]) => Date | null }).dataBaseDoAluno
const encurtaria = (acExpirationSync as unknown as { encurtaria: (calculado: Date, acTem: Date | null) => boolean }).encurtaria

const query = <T>(entries: T[]) => ({
  select: () => ({
    lean: () => ({
      exec: async () => entries
    })
  })
})

const mutationQuery = <T>(executar: () => Promise<T>) => ({
  lean: () => ({ exec: executar })
})

const estadoTratado = (
  userId: string,
  anchorDate: string,
  cycleYears: 1 | 2 = 1,
  saleIdentity = 'transaction:TX-ANTIGA'
) => ({
  userId,
  status: 'tratado',
  eventIdentity: JSON.stringify([new Date(anchorDate).toISOString(), cycleYears, saleIdentity]),
  saleIdentity,
  anchorDate: new Date(anchorDate),
  cycleYears,
  claimToken: null,
  leaseUntil: null,
  pendingEventIdentity: null,
  pendingAnchorDate: null,
  pendingCycleYears: null,
  pendingExpiration: null,
  claimedAt: null
})

const oferta = (partial: Record<string, unknown> = {}) => ({
  offerCode: 'oferta-renovacao',
  offerName: 'Renovação Turma 11 | 2509',
  periodYYMM: '2509',
  isRenewal: true,
  ...partial
})

function instalarFixturesSync(
  acEntries: any[],
  hotmartDocs: any[],
  ofertas = [oferta()],
  opcoes: {
    estados?: any[]
    respostasAc?: Array<boolean | Error>
    falharFinalizacoes?: number
    falharWatermarkUserIds?: string[]
    atrasarSegundoClaimAteFinalizar?: boolean
  } = {}
) {
  const acFindOriginal = (ACRenewalData as any).find
  const hotmartFindOriginal = (HotmartSaleHistory as any).find
  const renewalOfferFindOriginal = (RenewalOffer as any).find
  const updateOriginal = activeCampaignService.updateContactField
  const estadoModel = (mongoose.models as any).AcExpirationEventState
  const estadoFindOriginal = estadoModel?.find
  const estadoUpdateOneOriginal = estadoModel?.updateOne
  const estadoFindOneAndUpdateOriginal = estadoModel?.findOneAndUpdate
  const escritas: Array<[string, number, string]> = []
  const estados: any[] = [...(opcoes.estados ?? [])]
  const filtrosAc: any[] = []
  let claims = 0
  let libertarSegundoClaim: (() => void) | null = null
  const primeiraFinalizacao = new Promise<void>((resolve) => { libertarSegundoClaim = resolve })

  ;(ACRenewalData as any).find = (filtro: Record<string, unknown> = {}) => {
    filtrosAc.push(filtro)
    return query(acEntries.filter((entrada) =>
      (!filtro.email || entrada.email === filtro.email) &&
      (!filtro.userId || String(entrada.userId) === String(filtro.userId))
    ))
  }
  ;(HotmartSaleHistory as any).find = (filtro: any = {}) => query(
    hotmartDocs.filter((entrada) => !filtro.userId?.$in || filtro.userId.$in.some((id: unknown) => String(id) === String(entrada.userId)))
  )
  ;(RenewalOffer as any).find = () => query(ofertas)
  if (estadoModel) {
    estadoModel.find = () => query(estados)
    estadoModel.updateOne = async (filtro: { userId: unknown }, atualizacao: { $set: Record<string, unknown> }) => {
      if (opcoes.falharWatermarkUserIds?.includes(String(filtro.userId))) {
        throw new Error(`watermark indisponível para ${String(filtro.userId)}`)
      }
      if ((opcoes.falharFinalizacoes ?? 0) > 0) {
        opcoes.falharFinalizacoes = (opcoes.falharFinalizacoes ?? 0) - 1
        throw new Error('falha ao finalizar watermark')
      }
      const indice = estados.findIndex((estado) => String(estado.userId) === String(filtro.userId))
      const novoEstado = { ...(indice === -1 ? {} : estados[indice]), userId: filtro.userId, ...atualizacao.$set }
      if (indice === -1) estados.push(novoEstado)
      else estados[indice] = novoEstado
      return { acknowledged: true }
    }
    estadoModel.findOneAndUpdate = (filtro: any, atualizacao: any) => mutationQuery(async () => {
      const userId = String(filtro.userId)
      const set = atualizacao.$set ?? {}
      const eClaim = typeof set.claimToken === 'string' && typeof set.pendingEventIdentity === 'string'
      const eFinalizacao = set.status === 'tratado' && typeof set.eventIdentity === 'string'

      if (eClaim) {
        claims += 1
        if (opcoes.atrasarSegundoClaimAteFinalizar && claims === 2) await primeiraFinalizacao
        if (opcoes.falharWatermarkUserIds?.includes(userId)) {
          throw new Error(`watermark indisponível para ${userId}`)
        }
      }

      const indice = estados.findIndex((estado) => String(estado.userId) === userId)
      const actual = indice === -1 ? null : estados[indice]

      if (eClaim) {
        const alvo = new Date(set.pendingAnchorDate).getTime()
        const anosAlvo = Number(set.pendingCycleYears)
        const ramoTratadoIgual = filtro.$and?.[1]?.$or?.find((ramo: any) => ramo.anchorDate instanceof Date && ramo.cycleYears)
        const permiteTratadoIgual = Boolean(ramoTratadoIgual?.cycleYears?.$lte)
        const ramoEpisodioVazio = filtro.$and?.[1]?.$or?.find((ramo: any) =>
          ramo.anchorDate instanceof Date &&
          typeof ramo.cycleYears === 'number' &&
          ramo.$or?.some((guarda: any) => guarda.emptyExpirationSnapshotAt)
        )
        const snapshotVazioAlvo = set.pendingEmptyExpirationSnapshotAt
          ? new Date(set.pendingEmptyExpirationSnapshotAt).getTime()
          : null
        const episodioVazioNovo = Boolean(
          ramoEpisodioVazio &&
          snapshotVazioAlvo !== null &&
          (!actual?.emptyExpirationSnapshotAt ||
            new Date(actual.emptyExpirationSnapshotAt).getTime() < snapshotVazioAlvo)
        )
        const ramoPendenteIgual = filtro.$and?.[2]?.$or?.find((ramo: any) => ramo.pendingAnchorDate instanceof Date && ramo.pendingCycleYears)
        const permitePendenteIgual = Boolean(ramoPendenteIgual?.pendingCycleYears?.$lte)
        if (actual?.anchorDate && new Date(actual.anchorDate).getTime() > alvo) return null
        if (
          actual?.anchorDate &&
          new Date(actual.anchorDate).getTime() === alvo &&
          (Number(actual.cycleYears) > anosAlvo ||
            (Number(actual.cycleYears) === anosAlvo && !permiteTratadoIgual && !episodioVazioNovo))
        ) return null
        if (actual?.pendingAnchorDate && new Date(actual.pendingAnchorDate).getTime() > alvo) return null
        if (
          actual?.pendingAnchorDate &&
          new Date(actual.pendingAnchorDate).getTime() === alvo &&
          ramoPendenteIgual &&
          (Number(actual.pendingCycleYears) > anosAlvo ||
            (Number(actual.pendingCycleYears) === anosAlvo && !permitePendenteIgual))
        ) return null
        if (
          actual && !['livre', 'tratado'].includes(actual.status) &&
          (!actual.leaseUntil || new Date(actual.leaseUntil).getTime() > Date.now())
        ) return null
      } else if (filtro.claimToken && actual?.claimToken !== filtro.claimToken) {
        return null
      } else if (filtro.pendingEventIdentity && actual?.pendingEventIdentity !== filtro.pendingEventIdentity) {
        return null
      }

      if (eFinalizacao && (opcoes.falharFinalizacoes ?? 0) > 0) {
        opcoes.falharFinalizacoes = (opcoes.falharFinalizacoes ?? 0) - 1
        throw new Error('falha ao finalizar watermark')
      }

      const novo = { ...(actual ?? { userId }), ...set }
      for (const campo of Object.keys(atualizacao.$unset ?? {})) delete novo[campo]
      if (indice === -1) estados.push(novo)
      else estados[indice] = novo
      if (eFinalizacao) libertarSegundoClaim?.()
      return { ...novo }
    })
  }
  activeCampaignService.updateContactField = async (email, fieldId, value) => {
    escritas.push([email, fieldId, value])
    const resposta = opcoes.respostasAc?.shift() ?? true
    if (resposta instanceof Error) throw resposta
    return resposta
  }

  return {
    escritas,
    estados,
    filtrosAc,
    restaurar: () => {
      ;(ACRenewalData as any).find = acFindOriginal
      ;(HotmartSaleHistory as any).find = hotmartFindOriginal
      ;(RenewalOffer as any).find = renewalOfferFindOriginal
      if (estadoModel) {
        estadoModel.find = estadoFindOriginal
        estadoModel.updateOne = estadoUpdateOneOriginal
        estadoModel.findOneAndUpdate = estadoFindOneAndUpdateOriginal
      }
      activeCampaignService.updateContactField = updateOriginal
    }
  }
}

const alunoAc = (partial: Record<string, unknown> = {}) => ({
  userId: 'aluno-1',
  email: 'aluno@example.com',
  contactId: 'contact-1',
  purchaseDate: null,
  expirationDate: null,
  refundDate: null,
  purchaseStatus: null,
  lastSyncedAt: new Date('2026-08-23T10:00:00.000Z'),
  ...partial
})

const alunoHotmart = (data: Date, partial: Record<string, unknown> = {}) => ({
  userId: 'aluno-1',
  sales: [venda({ approvedDate: data, transaction: 'TX-1', offerCode: 'oferta-renovacao' })],
  latestApprovedDate: data,
  latestTransactionStatus: 'APPROVED',
  ...partial
})

test('computeExpirationFromPurchaseDate respeita os anos e devolve o último instante do mês', () => {
  const casos = [
    ['2026-08-11T12:00:00Z', 1, '2027-08-31T23:59:59.999Z'],
    ['2026-01-31T12:00:00Z', 1, '2027-01-31T23:59:59.999Z'],
    ['2024-02-29T12:00:00Z', 1, '2025-02-28T23:59:59.999Z'],
    ['2026-12-15T12:00:00Z', 1, '2027-12-31T23:59:59.999Z'],
    ['2026-09-11T12:00:00Z', 2, '2028-09-30T23:59:59.999Z']
  ] as const

  for (const [compra, anos, esperado] of casos) {
    assert.equal(acExpirationSync.computeExpirationFromPurchaseDate(new Date(compra), anos).toISOString(), esperado)
  }
})

test('dataBaseDoAluno devolve a compra âncora do último ciclo', () => {
  const prestacoes = ['2026-03-31', '2026-05-01', '2026-06-05', '2026-08-03'].map((data, i) =>
    venda({ approvedDate: new Date(`${data}T00:00:00Z`), offerCode: 'prestações', transaction: `P${i}` })
  )
  assert.equal(dataBaseDoAluno(prestacoes)?.toISOString(), '2026-03-31T00:00:00.000Z')

  assert.equal(
    dataBaseDoAluno([venda({ approvedDate: new Date('2026-04-15T00:00:00Z'), transaction: 'ÚNICA' })])?.toISOString(),
    '2026-04-15T00:00:00.000Z'
  )

  assert.equal(
    dataBaseDoAluno([
      venda({ approvedDate: new Date('2025-02-10T00:00:00Z'), offerCode: 'anual', transaction: '2025' }),
      venda({ approvedDate: new Date('2026-02-10T00:00:00Z'), offerCode: 'anual', transaction: '2026' })
    ])?.toISOString(),
    '2026-02-10T00:00:00.000Z'
  )

  assert.equal(dataBaseDoAluno([]), null)
  assert.equal(
    dataBaseDoAluno([venda({ approvedDate: new Date('2026-05-25T00:00:00Z'), transactionStatus: 'REFUNDED' })]),
    null
  )
})

test('encurtaria só bloqueia uma expiração calculada anterior à existente na AC', () => {
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), new Date('2027-05-31T23:59:59.999Z')), true)
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), new Date('2026-05-31T23:59:59.999Z')), false)
  assert.equal(encurtaria(new Date('2027-05-31T23:59:59.999Z'), new Date('2026-05-31T23:59:59.999Z')), false)
  assert.equal(encurtaria(new Date('2026-05-31T23:59:59.999Z'), null), false)
})

test('syncAcExpirationDates conta encurtaria e diverge mesmo com o gatilho alinhado', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: compra, expirationDate: new Date('2027-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedWouldShorten, 1)
  assert.equal(report.divergentes.length, 1)
  assert.equal(report.divergentes[0].motivo, 'encurtaria')
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados.length, 1)
})

test('syncAcExpirationDates em dry-run por defeito só reporta a escrita que faria', async (t) => {
  const compraAntiga = new Date('2025-05-15T00:00:00Z')
  const compraNova = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: compraAntiga })],
    [alunoHotmart(compraNova)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.wouldWrite, 1)
  assert.equal(report.written, 0)
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates trata vendas apenas reembolsadas como reembolso Hotmart', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [
      alunoHotmart(compra, {
        sales: [venda({ approvedDate: compra, transactionStatus: 'REFUNDED' })],
        latestTransactionStatus: 'REFUNDED'
      })
    ]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.skippedRefunded, 1)
  assert.equal(report.skippedNoHotmartData, 0)
  assert.equal(report.divergentes.length, 0)
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates reporta encurtaria mas não avança sem latestApprovedDate', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2027-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra, { latestApprovedDate: null })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedWouldShorten, 1)
  assert.equal(report.divergentes.length, 1)
  assert.equal(report.divergentes[0].motivo, 'encurtaria')
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados.length, 0)
})

test('syncAcExpirationDates só conta falta de latestApprovedDate depois de avaliar divergência segura', async (t) => {
  const compra = new Date('2025-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2025-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra, { latestApprovedDate: null })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates()

  assert.equal(report.divergentes.length, 1)
  assert.equal(report.divergentes[0].motivo, 'diferente')
  assert.equal(report.skippedNoHotmartData, 1)
  assert.equal(fixtures.escritas.length, 0)
})

test('syncAcExpirationDates só escreve quando dryRun é explicitamente falso', async (t) => {
  const compraAntiga = new Date('2025-05-15T00:00:00Z')
  const compraNova = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: compraAntiga })],
    [alunoHotmart(compraNova)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.wouldWrite, 0)
  assert.equal(report.written, 1)
  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-05-31']])
})

test('bootstrap real com expiração preenchida grava só o watermark sem chamar a AC', async (t) => {
  const compra = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ purchaseDate: new Date('2025-05-15T00:00:00Z'), expirationDate: new Date('2026-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal((report as any).bootstrapped, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados.length, 1)
})

test('segunda corrida real sem evento novo escreve zero', async (t) => {
  const compra = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra)]
  )
  t.after(fixtures.restaurar)

  const primeira = await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  const segunda = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(primeira.bootstrapped, 1)
  assert.equal(segunda.skippedNoNewEvent, 1)
  assert.equal(fixtures.escritas.length, 0)
})

test('evento já certo na AC avança o watermark sem escrever', async (t) => {
  const compra = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2027-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.alreadyInSync, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados.length, 1)
})

test('falta de contacto mantém o evento pendente', async (t) => {
  const compra = new Date('2026-05-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ contactId: null, expirationDate: new Date('2026-05-31T23:59:59.999Z') })],
    [alunoHotmart(compra)]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedNoContact, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados.length, 0)
})

test('uma renovação nova dispara apenas o aluno cujo ciclo mudou', async (t) => {
  const compraEstavel = new Date('2025-01-10T00:00:00Z')
  const compraNova = new Date('2026-02-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'estavel', email: 'estavel@example.com', expirationDate: new Date('2025-01-31T23:59:59.999Z') }),
      alunoAc({ userId: 'renovou', email: 'renovou@example.com', expirationDate: new Date('2026-02-28T23:59:59.999Z') })
    ],
    [
      alunoHotmart(compraEstavel, { userId: 'estavel', sales: [venda({ approvedDate: compraEstavel, transaction: 'ESTAVEL', offerCode: 'oferta-renovacao' })] }),
      alunoHotmart(compraNova, { userId: 'renovou', sales: [venda({ approvedDate: compraNova, transaction: 'NOVA', offerCode: 'oferta-renovacao' })] })
    ],
    [oferta()],
    {
      estados: [
        estadoTratado('estavel', '2025-01-10T00:00:00.000Z'),
        estadoTratado('renovou', '2025-02-10T00:00:00.000Z')
      ]
    }
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.written, 1)
  assert.deepEqual(fixtures.escritas, [['renovou@example.com', 332, '2027-02-28']])
})

test('uma prestação posterior do mesmo ciclo não cria evento', async (t) => {
  const ancora = new Date('2026-03-10T00:00:00Z')
  const prestacao = new Date('2026-04-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-03-31T23:59:59.999Z') })],
    [alunoHotmart(prestacao, {
      sales: [
        venda({ approvedDate: ancora, transaction: 'P-1', offerCode: 'oferta-renovacao' }),
        venda({ approvedDate: prestacao, transaction: 'P-2', offerCode: 'oferta-renovacao' })
      ]
    })],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2026-03-10T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedNoNewEvent, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados[0].eventIdentity, '["2026-03-10T00:00:00.000Z",1,"transaction:TX-ANTIGA"]')
})

test('uma extensão que muda o ciclo de um para dois anos cria evento', async (t) => {
  const compra = new Date('2026-06-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2027-06-30T23:59:59.999Z') })],
    [alunoHotmart(compra, {
      sales: [
        venda({ approvedDate: compra, transaction: 'RENOV-EXT', offerCode: 'oferta-renovacao' }),
        venda({ approvedDate: compra, transaction: 'EXT', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
      ]
    })],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2026-06-05T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2028-06-30']])
  assert.equal(fixtures.estados[0].cycleYears, 2)
})

test('expiração vazia continua elegível durante o bootstrap', async (t) => {
  const compra = new Date('2026-07-05T00:00:00Z')
  const fixtures = instalarFixturesSync([alunoAc({ expirationDate: null })], [alunoHotmart(compra)])
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.written, 1)
  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-07-31']])
  assert.equal(fixtures.estados.length, 1)
})

test('o mesmo ciclo tratado abre um episódio para uma fotografia AC vazia', async (t) => {
  const compra = new Date('2026-07-10T00:00:00Z')
  const fotografia = new Date('2026-08-23T11:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: null, lastSyncedAt: fotografia })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', compra.toISOString(), 1, 'transaction:TX-1')] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-07-31']])
  assert.equal(fixtures.estados[0].emptyExpirationSnapshotAt?.toISOString(), fotografia.toISOString())
})

test('concorrência e repetição da mesma fotografia AC vazia não duplicam a escrita', async (t) => {
  const compra = new Date('2026-07-12T00:00:00Z')
  const fotografia = new Date('2026-08-23T12:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: null, lastSyncedAt: fotografia })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', compra.toISOString(), 1, 'transaction:TX-1')] }
  )
  t.after(fixtures.restaurar)

  await Promise.all([
    acExpirationSync.syncAcExpirationDates({ dryRun: false }),
    acExpirationSync.syncAcExpirationDates({ dryRun: false })
  ])
  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-07-31']])
  assert.equal(fixtures.estados[0].emptyExpirationSnapshotAt?.toISOString(), fotografia.toISOString())
})

test('uma fotografia AC vazia posterior abre um novo episódio observável', async (t) => {
  const compra = new Date('2026-07-14T00:00:00Z')
  const acEntries = [alunoAc({
    expirationDate: null,
    lastSyncedAt: new Date('2026-08-23T13:00:00Z')
  })]
  const fixtures = instalarFixturesSync(
    acEntries,
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', compra.toISOString(), 1, 'transaction:TX-1')] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  acEntries[0].lastSyncedAt = new Date('2026-08-23T14:00:00Z')
  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(fixtures.escritas.length, 2)
  assert.equal(fixtures.estados[0].emptyExpirationSnapshotAt.toISOString(), '2026-08-23T14:00:00.000Z')
})

test('confirmação externa pendente não reabre com uma fotografia AC vazia posterior', async (t) => {
  const compra = new Date('2026-07-16T00:00:00Z')
  const pendente = {
    ...estadoTratado('aluno-1', compra.toISOString(), 1, 'transaction:TX-1'),
    status: 'confirmacao-pendente',
    claimToken: 'claim-externo',
    leaseUntil: new Date('2099-01-01T00:00:00Z'),
    pendingEventIdentity: '["2026-07-16T00:00:00.000Z",1,"transaction:TX-1"]',
    pendingSaleIdentity: 'transaction:TX-1',
    pendingAnchorDate: compra,
    pendingCycleYears: 1,
    pendingExpiration: new Date('2027-07-31T23:59:59.999Z'),
    pendingEmptyExpirationSnapshotAt: new Date('2026-08-23T15:00:00Z'),
    pendingReason: 'external-write'
  }
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: null, lastSyncedAt: new Date('2026-08-23T16:00:00Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [pendente] }
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.confirmationPending, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados[0].claimToken, 'claim-externo')
})

test('execução manual por email não varre os outros alunos', async (t) => {
  const compra = new Date('2026-08-05T00:00:00Z')
  const estado = estadoTratado('manual', '2026-08-05T00:00:00.000Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'manual', email: 'manual@example.com', expirationDate: new Date('2026-08-31T23:59:59.999Z') }),
      alunoAc({ userId: 'outro', email: 'outro@example.com', expirationDate: new Date('2026-08-31T23:59:59.999Z') })
    ],
    [
      alunoHotmart(compra, { userId: 'manual' }),
      alunoHotmart(compra, { userId: 'outro' })
    ],
    [oferta()],
    { estados: [estado, estadoTratado('outro', '2026-08-05T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false, manual: { email: 'MANUAL@example.com' } })

  assert.deepEqual(fixtures.filtrosAc, [{ email: 'manual@example.com' }])
  assert.deepEqual(fixtures.escritas, [['manual@example.com', 332, '2027-08-31']])
})

test('dry-run não chama a AC nem avança o watermark de um evento novo', async (t) => {
  const compra = new Date('2026-09-05T00:00:00Z')
  const identidadeAntiga = '["2025-09-05T00:00:00.000Z",1,"transaction:TX-ANTIGA"]'
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-09-30T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2025-09-05T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: true })

  assert.equal(report.wouldWrite, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados[0].eventIdentity, identidadeAntiga)
})

test('falha da AC não avança o watermark e a corrida seguinte tenta de novo', async (t) => {
  const compra = new Date('2026-10-05T00:00:00Z')
  const identidadeAntiga = '["2025-10-05T00:00:00.000Z",1,"transaction:TX-ANTIGA"]'
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-10-31T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2025-10-05T00:00:00.000Z')], respostasAc: [false, true] }
  )
  t.after(fixtures.restaurar)

  const falhou = await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(falhou.errors.length, 1)
  assert.equal(fixtures.estados[0].eventIdentity, identidadeAntiga)

  const repetiu = await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(repetiu.written, 1)
  assert.equal(fixtures.escritas.length, 2)
  assert.equal(fixtures.estados[0].eventIdentity, '["2026-10-05T00:00:00.000Z",1,"transaction:TX-1"]')
})

test('duas corridas simultâneas reclamam o evento uma vez e fazem uma chamada à AC', async (t) => {
  const compra = new Date('2026-11-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-11-30T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2025-11-05T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  await Promise.all([
    acExpirationSync.syncAcExpirationDates({ dryRun: false }),
    acExpirationSync.syncAcExpirationDates({ dryRun: false })
  ])

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-11-30']])
})

test('o contender tardio perde o claim quando a primeira corrida já finalizou o mesmo evento', async (t) => {
  const compra = new Date('2026-11-08T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-11-30T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    {
      estados: [estadoTratado('aluno-1', '2025-11-08T00:00:00.000Z')],
      atrasarSegundoClaimAteFinalizar: true
    }
  )
  t.after(fixtures.restaurar)

  await Promise.all([
    acExpirationSync.syncAcExpirationDates({ dryRun: false }),
    acExpirationSync.syncAcExpirationDates({ dryRun: false })
  ])

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-11-30']])
})

test('preencher a transação da mesma âncora não cria um evento falso', async (t) => {
  const compra = new Date('2026-11-12T00:00:00Z')
  const sales = [venda({ approvedDate: compra, transaction: null, offerCode: 'oferta-renovacao' })]
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-11-30T23:59:59.999Z') })],
    [alunoHotmart(compra, { sales })]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(fixtures.estados[0].saleIdentity, 'offer:oferta-renovacao')
  assert.equal(
    fixtures.estados[0].eventIdentity,
    '["2026-11-12T00:00:00.000Z",1,"offer:oferta-renovacao"]'
  )
  sales[0].transaction = 'TX-PREENCHIDA'
  const segunda = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(segunda.skippedNoNewEvent, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados[0].saleIdentity, 'offer:oferta-renovacao')
})

test('um ciclo genuinamente novo usa a transação como chave canónica da venda', async (t) => {
  const compra = new Date('2026-11-20T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-11-30T23:59:59.999Z') })],
    [alunoHotmart(compra, {
      sales: [venda({ approvedDate: compra, transaction: 'VENDA-NOVA', offerCode: 'oferta-renovacao' })]
    })],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2025-11-20T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(fixtures.estados[0].saleIdentity, 'transaction:VENDA-NOVA')
  assert.equal(
    fixtures.estados[0].eventIdentity,
    '["2026-11-20T00:00:00.000Z",1,"transaction:VENDA-NOVA"]'
  )
})

test('sucesso na AC com falha de finalização fica pendente e reconcilia sem duplicar', async (t) => {
  const compra = new Date('2026-12-05T00:00:00Z')
  const acEntries = [alunoAc({ expirationDate: new Date('2026-12-31T23:59:59.999Z') })]
  const fixtures = instalarFixturesSync(
    acEntries,
    [alunoHotmart(compra)],
    [oferta()],
    {
      estados: [estadoTratado('aluno-1', '2025-12-05T00:00:00.000Z')],
      falharFinalizacoes: 1
    }
  )
  t.after(fixtures.restaurar)

  const primeira = await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(primeira.errors.length, 1)
  assert.equal(fixtures.estados[0].status, 'confirmacao-pendente')

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(fixtures.escritas.length, 1)
  assert.equal(fixtures.estados[0].status, 'confirmacao-pendente')

  acEntries[0].expirationDate = new Date('2027-12-31T23:59:59.999Z')
  await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(fixtures.escritas.length, 1)
  assert.equal(fixtures.estados[0].status, 'tratado')
})

test('falha de CAS num aluno é reportada e não impede o bootstrap do seguinte', async (t) => {
  const compra = new Date('2026-12-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'falha', email: 'falha@example.com', expirationDate: new Date('2026-12-31T23:59:59.999Z') }),
      alunoAc({ userId: 'continua', email: 'continua@example.com', expirationDate: new Date('2026-12-31T23:59:59.999Z') })
    ],
    [
      alunoHotmart(compra, { userId: 'falha' }),
      alunoHotmart(compra, { userId: 'continua' })
    ],
    [oferta()],
    { falharWatermarkUserIds: ['falha'] }
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.errors.length, 1)
  assert.equal(report.bootstrapped, 1)
  assert.equal(fixtures.estados.some((estado) => estado.userId === 'continua' && estado.status === 'tratado'), true)
})

test('falha ao finalizar bootstrap fica interna e refinaliza sem esperar a fotografia AC', async (t) => {
  const compra = new Date('2026-12-15T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-12-31T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { falharFinalizacoes: 1 }
  )
  t.after(fixtures.restaurar)

  const primeira = await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(primeira.errors.length, 1)
  assert.equal(fixtures.estados[0].status, 'finalizacao-pendente')

  const segunda = await acExpirationSync.syncAcExpirationDates({ dryRun: false })
  assert.equal(segunda.bootstrapped, 1)
  assert.equal(fixtures.estados[0].status, 'tratado')
  assert.equal(fixtures.escritas.length, 0)
})

test('uma fotografia antiga nunca faz regredir a âncora já tratada', async (t) => {
  const compraAntiga = new Date('2025-01-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: null })],
    [alunoHotmart(compraAntiga)],
    [oferta()],
    { estados: [estadoTratado('aluno-1', '2026-01-05T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedNoNewEvent, 1)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados[0].anchorDate.toISOString(), '2026-01-05T00:00:00.000Z')
})

test('chamada manual pode retomar um claim expirado que a libertação não removeu', async (t) => {
  const compra = new Date('2026-02-05T00:00:00Z')
  const pendente = {
    ...estadoTratado('aluno-1', '2025-02-05T00:00:00.000Z'),
    status: 'confirmacao-pendente',
    claimToken: 'claim-abandonado',
    leaseUntil: new Date('2026-02-06T00:00:00.000Z'),
    claimedAt: new Date('2026-02-05T00:00:00.000Z'),
    pendingEventIdentity: '["2026-02-05T00:00:00.000Z",1,"transaction:TX-1"]',
    pendingAnchorDate: compra,
    pendingCycleYears: 1,
    pendingExpiration: new Date('2027-02-28T23:59:59.999Z')
  }
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-02-28T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [pendente] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false, manual: { email: 'aluno@example.com' } })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-02-28']])
  assert.equal(fixtures.estados[0].status, 'tratado')
})

test('retoma manual nunca faz o pending regredir de dois para um ano', async (t) => {
  const compra = new Date('2026-02-20T00:00:00Z')
  const pendente = {
    ...estadoTratado('aluno-1', '2025-02-20T00:00:00.000Z'),
    status: 'confirmacao-pendente',
    claimToken: 'claim-dois-anos',
    leaseUntil: new Date('2026-02-21T00:00:00.000Z'),
    pendingEventIdentity: '["2026-02-20T00:00:00.000Z",2,"transaction:VENDA-2A"]',
    pendingAnchorDate: compra,
    pendingCycleYears: 2,
    pendingExpiration: new Date('2028-02-29T23:59:59.999Z')
  }
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-02-28T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [pendente] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false, manual: { email: 'aluno@example.com' } })

  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados[0].pendingCycleYears, 2)
})

test('dry-run observa uma confirmação pendente sem finalizar o watermark', async (t) => {
  const compra = new Date('2026-03-05T00:00:00Z')
  const pendente = {
    ...estadoTratado('aluno-1', '2025-03-05T00:00:00.000Z'),
    status: 'confirmacao-pendente',
    claimToken: 'claim-pendente',
    leaseUntil: new Date('2099-03-05T00:05:00.000Z'),
    pendingEventIdentity: '["2026-03-05T00:00:00.000Z",1,"transaction:TX-1"]',
    pendingAnchorDate: compra,
    pendingCycleYears: 1,
    pendingExpiration: new Date('2027-03-31T23:59:59.999Z')
  }
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2027-03-31T23:59:59.999Z') })],
    [alunoHotmart(compra)],
    [oferta()],
    { estados: [pendente] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: true })

  assert.equal(fixtures.estados[0].status, 'confirmacao-pendente')
  assert.equal(fixtures.estados[0].eventIdentity, '["2025-03-05T00:00:00.000Z",1,"transaction:TX-ANTIGA"]')
  assert.equal(fixtures.escritas.length, 0)
})

test('compra base preserva os dois anos do nome e escreve a expiração do período da oferta', async (t) => {
  const compra = new Date('2025-07-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [alunoHotmart(compra, { sales: [venda({ approvedDate: compra, transaction: 'BASE', offerCode: 'oferta-base' })] })],
    [oferta({ offerCode: 'oferta-base', offerName: 'OGI Turma 14 + [2 anos] | L2509 | 397', periodYYMM: '2509', isRenewal: false })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.semTurma, 0)
  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-09-30']])
})

test('códigos reais das Turmas 1 e 2 usam compra mais anos mesmo com nome base e isRenewal falso', async (t) => {
  const compraTurma1 = new Date('2026-01-05T00:00:00Z')
  const compraTurma2 = new Date('2025-06-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'turma-1', email: 'turma1@example.com' }),
      alunoAc({ userId: 'turma-2', email: 'turma2@example.com' })
    ],
    [
      alunoHotmart(compraTurma1, { userId: 'turma-1', sales: [venda({ approvedDate: compraTurma1, transaction: 'RENOV-T1', offerCode: TURMA_1_RENEWAL_OFFER_CODE })] }),
      alunoHotmart(compraTurma2, {
        userId: 'turma-2',
        sales: [
          venda({ approvedDate: compraTurma2, transaction: 'RENOV-T2', offerCode: TURMA_2_RENEWAL_OFFER_CODE }),
          venda({ approvedDate: compraTurma2, transaction: 'EXT-T2', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
        ]
      })
    ],
    [
      oferta({ offerCode: TURMA_1_RENEWAL_OFFER_CODE, offerName: 'OGI Turma 1 | L2701 | 397', periodYYMM: '2701', isRenewal: false }),
      oferta({ offerCode: TURMA_2_RENEWAL_OFFER_CODE, offerName: 'OGI Turma 2 | L2706 | 397', periodYYMM: '2706', isRenewal: false })
    ]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [
    ['turma1@example.com', 332, '2027-01-31'],
    ['turma2@example.com', 332, '2027-06-30']
  ])
})

test('nome classificado como renovação escreve os dois anos do ciclo', async (t) => {
  const compra = new Date('2025-08-11T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: new Date('2026-08-31T23:59:59.999Z') })],
    [alunoHotmart(compra, {
      sales: [
        venda({ approvedDate: compra, transaction: 'RENOV-2A', offerCode: 'renov-nome' }),
        venda({ approvedDate: compra, transaction: 'EXT-2A', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
      ]
    })],
    [oferta({ offerCode: 'renov-nome', offerName: 'Turma 11 [renov] | 2509', periodYYMM: '2509', isRenewal: false })],
    { estados: [estadoTratado('aluno-1', '2025-08-11T00:00:00.000Z')] }
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2027-08-31']])
})

test('ciclo de dois anos com a expiração vazia não cai no cálculo de um ano', async (t) => {
  const compra = new Date('2026-09-09T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc({ expirationDate: null })],
    [alunoHotmart(compra, {
      sales: [
        venda({ approvedDate: compra, transaction: 'RENOV-VAZIA', offerCode: 'renov-2a' }),
        venda({ approvedDate: compra, transaction: 'EXT-VAZIA', offerCode: 'extensao', hotmartProductId: '3100292', priceValue: 97 })
      ]
    })],
    [oferta({ offerCode: 'renov-2a', offerName: 'Renovação Turma 12 | 2609', periodYYMM: '2609', isRenewal: true })]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2028-09-30']])
})

test('oferta base sem nome e período válidos não escreve e conta semTurma', async (t) => {
  const compra = new Date('2026-03-04T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [alunoHotmart(compra, { sales: [venda({ approvedDate: compra, transaction: 'SEM-TURMA', offerCode: 'oferta-incompleta' })] })],
    [oferta({ offerCode: 'oferta-incompleta', offerName: 'OGI sem turma', periodYYMM: null, isRenewal: false })]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.semTurma, 1)
  assert.equal(report.needsWrite, 0)
  assert.equal(fixtures.escritas.length, 0)
  assert.equal(fixtures.estados.length, 0)
})

test('encurtaria recusa escritas calculadas pelos ramos base e renovação', async (t) => {
  const compraBase = new Date('2025-07-10T00:00:00Z')
  const compraRenovacao = new Date('2026-01-05T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [
      alunoAc({ userId: 'base', email: 'base@example.com', expirationDate: new Date('2027-09-30T23:59:59.999Z') }),
      alunoAc({ userId: 'renovacao', email: 'renovacao@example.com', expirationDate: new Date('2028-01-31T23:59:59.999Z') })
    ],
    [
      alunoHotmart(compraBase, { userId: 'base', sales: [venda({ approvedDate: compraBase, transaction: 'BASE', offerCode: 'oferta-base' })] }),
      alunoHotmart(compraRenovacao, { userId: 'renovacao', sales: [venda({ approvedDate: compraRenovacao, transaction: 'RENOV', offerCode: 'oferta-renovacao' })] })
    ],
    [
      oferta({ offerCode: 'oferta-base', offerName: 'OGI Turma 15 | L2509 | 397', periodYYMM: '2509', isRenewal: false }),
      oferta()
    ]
  )
  t.after(fixtures.restaurar)

  const report = await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.equal(report.skippedWouldShorten, 2)
  assert.deepEqual(report.divergentes.map((d) => d.motivo), ['encurtaria', 'encurtaria'])
  assert.equal(fixtures.escritas.length, 0)
})

test('a compra âncora, não a última prestação, escolhe a oferta e a data', async (t) => {
  const ancora = new Date('2025-07-10T00:00:00Z')
  const prestacao = new Date('2025-08-10T00:00:00Z')
  const fixtures = instalarFixturesSync(
    [alunoAc()],
    [alunoHotmart(prestacao, {
      sales: [
        venda({ approvedDate: ancora, transaction: 'PLANO', offerCode: 'oferta-base' }),
        venda({ approvedDate: prestacao, transaction: 'PLANO', offerCode: 'oferta-renovacao' })
      ]
    })],
    [
      oferta({ offerCode: 'oferta-base', offerName: 'OGI Turma 15 | L2509 | 397', periodYYMM: '2509', isRenewal: false }),
      oferta()
    ]
  )
  t.after(fixtures.restaurar)

  await acExpirationSync.syncAcExpirationDates({ dryRun: false })

  assert.deepEqual(fixtures.escritas, [['aluno@example.com', 332, '2026-09-30']])
})
