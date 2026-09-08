import { activeCampaignService } from '../activeCampaign/activeCampaignService'
import { AC_EXPIRATION_DATE_FIELD_ID } from './acRenewalDataSync.service'
import type { CicloBase } from './renewalTimeline.types'
import { calcularExpiracao, chaveIdempotente, encurtaria, formatDateYYYYMMDD, identidadeDaVenda, identidadeDaVendaPersistida, identidadeDoEvento, sameDay } from './acExpirationPolicy'
export { computeExpirationFromPurchaseDate, dataBaseDoAluno, encurtaria, identidadeDaVenda, identidadeDoEvento } from './acExpirationPolicy'
import { createAcExpirationEventStore } from './acExpirationEventStore'
import { mainParityProviderStarted, mainParityProviderSucceeded } from './mainParityExecution'
import { loadAcExpirationContext } from './acExpirationContext'
import type { AcExpirationSyncReport, EstadoEvento, SeletorManual } from './acExpiration.types'
export type { AcExpirationSyncReport, EstadoEvento, SeletorManual } from './acExpiration.types'
const REFUND_TRANSACTION_STATUSES = new Set(['REFUNDED', 'CHARGEBACK'])
function compararComWatermark(ciclo: CicloBase, estado: EstadoEvento | undefined): -1 | 0 | 1 {
  if (!estado?.anchorDate || !estado.cycleYears) return 1
  const ancora = ciclo.compras[0].data.getTime()
  const anterior = new Date(estado.anchorDate).getTime()
  if (ancora < anterior) return -1
  if (ancora > anterior) return 1
  if (ciclo.anos < estado.cycleYears) return -1
  if (ciclo.anos > estado.cycleYears) return 1
  return 0
}
interface SyncOpcoes {
  dryRun?: boolean
  manual?: SeletorManual
}
export async function syncAcExpirationDates(opcoes: SyncOpcoes = {}): Promise<AcExpirationSyncReport> {
  const dryRun = opcoes.dryRun !== false
  const manual = opcoes.manual
  if (manual && !manual.email && !manual.userId) {
    throw new Error('A execução manual exige email ou userId')
  }
  const report: AcExpirationSyncReport = {
    candidatesChecked: 0,
    alreadyInSync: 0,
    needsWrite: 0,
    written: 0,
    wouldWrite: 0,
    skippedRefunded: 0,
    skippedNoContact: 0,
    skippedNoHotmartData: 0,
    semTurma: 0,
    skippedWouldShorten: 0,
    bootstrapped: 0,
    skippedNoNewEvent: 0,
    claimConflicts: 0,
    confirmationPending: 0,
    divergentes: [],
    errors: []
  }
  const { acEntries, hotmartByUserId, turmaActualByUserId, estadoByUserId, cicloByUserId, ofertaByCode } = await loadAcExpirationContext(manual)
  const { reclamarEvento, finalizarEvento, libertarClaim, marcarConfirmacaoPendente, registarErro, criarRasto, marcarRastoRecusado } = createAcExpirationEventStore({ manual, dryRun, report })
  for (const ac of acEntries) {
    try {
      if (ac.refundDate || ac.purchaseStatus === 'Reembolsada') {
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        const eventoReembolsoAc = ac.refundDate
          ? ac.refundDate.toISOString()
          : `estado:${ac.purchaseStatus}`
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'reembolsado',
          chaveIdempotente([
            'expiracao', String(ac.userId), 'reembolso-ac', eventoReembolsoAc, 'reembolsado', dryRun
          ]),
          true
        )
        report.skippedRefunded += 1
        continue
      }
      const hm = hotmartByUserId.get(String(ac.userId))
      if (hm?.latestTransactionStatus && REFUND_TRANSACTION_STATUSES.has(hm.latestTransactionStatus)) {
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        const vendaReembolsada = [...(hm.sales ?? [])]
          .filter((venda) => venda.transactionStatus === hm.latestTransactionStatus)
          .sort((a, b) => {
            const dataA = a.orderDate ?? a.approvedDate
            const dataB = b.orderDate ?? b.approvedDate
            return (dataA?.getTime() ?? 0) - (dataB?.getTime() ?? 0)
          })
          .at(-1)
        const eventoReembolsoHotmart = chaveIdempotente([
          hm.latestTransactionStatus,
          vendaReembolsada?.transaction ?? null,
          (vendaReembolsada?.orderDate ?? vendaReembolsada?.approvedDate ?? hm.latestApprovedDate)?.toISOString() ?? null
        ])
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'reembolsado',
          chaveIdempotente([
            'expiracao', String(ac.userId), 'reembolso-hotmart', eventoReembolsoHotmart, 'reembolsado', dryRun
          ]),
          true
        )
        report.skippedRefunded += 1
        continue
      }
      const ciclo = cicloByUserId.get(String(ac.userId))
      const ancora = ciclo?.compras[0]
      if (!ciclo || !ancora) {
        report.skippedNoHotmartData += 1
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'semVenda',
          chaveIdempotente([
            'expiracao', String(ac.userId), antes, null, 'semVenda', dryRun,
            new Date(ac.lastSyncedAt).toISOString()
          ]),
          true
        )
        continue
      }
      const expiration = calcularExpiracao(
        ciclo,
        ofertaByCode.get(ancora.offerCode ?? ''),
        turmaActualByUserId.get(String(ac.userId)) ?? null
      )
      if (!expiration) {
        report.semTurma += 1
        const antes = ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null
        const identidadeSemTurma = identidadeDoEvento(ciclo)
        await criarRasto(
          ac.email,
          antes,
          null,
          'recusado',
          'semTurma',
          chaveIdempotente(['expiracao', String(ac.userId), identidadeSemTurma, antes, null, 'semTurma', dryRun]),
          true
        )
        continue
      }
      const encurta = encurtaria(expiration, ac.expirationDate)
      let estado = estadoByUserId.get(String(ac.userId))
      if (estado?.status === 'finalizacao-pendente') {
        if (dryRun) {
          report.confirmationPending += 1
          continue
        }
        const saleIdentityPendente = estado.pendingSaleIdentity ??
          identidadeDaVendaPersistida(estado.pendingEventIdentity) ??
          identidadeDaVenda(ciclo)
        const motivoPendente = estado.pendingReason
        const finalizado = await finalizarEvento(
          ac.userId,
          estado.pendingEventIdentity!,
          new Date(estado.pendingAnchorDate!),
          estado.pendingCycleYears!,
          saleIdentityPendente,
          'finalizacao-pendente',
          null,
          { claimToken: estado.claimToken! }
        )
        if (!finalizado) {
          report.claimConflicts += 1
          continue
        }
        estado = finalizado
        estadoByUserId.set(String(ac.userId), finalizado)
        if (motivoPendente === 'bootstrap') report.bootstrapped += 1
        if (motivoPendente === 'already-right') report.alreadyInSync += 1
      }
      if (estado?.status === 'claimado' || estado?.status === 'confirmacao-pendente') {
        if (dryRun) {
          report.confirmationPending += 1
          continue
        }
        const pendenteConfirmado = Boolean(
          estado.pendingExpiration &&
          ac.expirationDate &&
          sameDay(new Date(estado.pendingExpiration), ac.expirationDate)
        )
        const leaseExpirada = Boolean(
          estado.leaseUntil && new Date(estado.leaseUntil).getTime() <= Date.now()
        )
        const retomaManual = Boolean(manual) && leaseExpirada
        if (!pendenteConfirmado && !retomaManual) {
          report.confirmationPending += 1
          continue
        }
        if (pendenteConfirmado) {
          const saleIdentityPendente = estado.pendingSaleIdentity ??
            identidadeDaVendaPersistida(estado.pendingEventIdentity) ??
            identidadeDaVenda(ciclo)
          const finalizado = await finalizarEvento(
            ac.userId,
            estado.pendingEventIdentity!,
            new Date(estado.pendingAnchorDate!),
            estado.pendingCycleYears!,
            saleIdentityPendente,
            estado.status,
            estado.pendingEmptyExpirationSnapshotAt
              ? new Date(estado.pendingEmptyExpirationSnapshotAt)
              : null,
            { pendingEventIdentity: estado.pendingEventIdentity! }
          )
          if (!finalizado) {
            report.claimConflicts += 1
            continue
          }
          estado = finalizado
          estadoByUserId.set(String(ac.userId), finalizado)
          report.alreadyInSync += 1
        }
      }
      const relacao = compararComWatermark(ciclo, estado)
      if (relacao < 0) {
        report.skippedNoNewEvent += 1
        continue
      }
      const eventoNovo = relacao > 0
      const mesmaAncoraTratada = Boolean(
        estado?.anchorDate && new Date(estado.anchorDate).getTime() === ancora.data.getTime()
      )
      const mesmaAncoraPendente = Boolean(
        estado?.pendingAnchorDate && new Date(estado.pendingAnchorDate).getTime() === ancora.data.getTime()
      )
      const saleIdentity =
        (mesmaAncoraPendente
          ? estado?.pendingSaleIdentity ?? identidadeDaVendaPersistida(estado?.pendingEventIdentity)
          : null) ??
        (mesmaAncoraTratada
          ? estado?.saleIdentity ?? identidadeDaVendaPersistida(estado?.eventIdentity)
          : null) ??
        identidadeDaVenda(ciclo)
      const eventIdentity = identidadeDoEvento(ciclo, saleIdentity)
      const expiracaoVazia = !ac.expirationDate && ac.syncError === null
      const emptyExpirationSnapshotAt = expiracaoVazia ? new Date(ac.lastSyncedAt) : null
      const episodioVazioNovo = Boolean(
        emptyExpirationSnapshotAt &&
        (!estado?.emptyExpirationSnapshotAt ||
          new Date(estado.emptyExpirationSnapshotAt).getTime() < emptyExpirationSnapshotAt.getTime())
      )
      const elegivel = Boolean(manual) || episodioVazioNovo || eventoNovo
      if (!ac.expirationDate || !sameDay(expiration, ac.expirationDate)) {
        report.divergentes.push({
          email: ac.email,
          acTem: ac.expirationDate,
          calculado: expiration,
          motivo: encurta ? 'encurtaria' : 'diferente'
        })
      }
      if (!hm?.latestApprovedDate) {
        if (encurta) report.skippedWouldShorten += 1
        report.skippedNoHotmartData += 1
        if (elegivel) {
          await criarRasto(
            ac.email,
            ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
            formatDateYYYYMMDD(expiration),
            'recusado',
            'semVenda',
            chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'semVenda', dryRun]),
            true
          )
        }
        continue
      }
      if (!ac.contactId) {
        report.skippedNoContact += 1
        if (elegivel) {
          await criarRasto(
            ac.email,
            ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
            formatDateYYYYMMDD(expiration),
            'recusado',
            'semContacto',
            chaveIdempotente([
              'expiracao', String(ac.userId), eventIdentity, 'semContacto', dryRun,
              emptyExpirationSnapshotAt?.toISOString() ?? null
            ]),
            true
          )
        }
        continue
      }
      if (encurta || (ac.expirationDate && sameDay(expiration, ac.expirationDate))) {
        if (encurta) report.skippedWouldShorten += 1
        else if (estado?.status !== 'tratado' || eventoNovo) report.alreadyInSync += 1
        let claim: EstadoEvento | null = null
        if (!dryRun && (eventoNovo || Boolean(manual))) {
          const reason = encurta ? 'would-shorten' : 'already-right'
          claim = await reclamarEvento(ac.userId, ciclo, eventIdentity, saleIdentity, expiration, reason)
          if (!claim) {
            report.claimConflicts += 1
            continue
          }
        }
        if (encurta && elegivel) {
          try {
            await criarRasto(
              ac.email,
              formatDateYYYYMMDD(ac.expirationDate!),
              formatDateYYYYMMDD(expiration),
              'recusado',
              'encurtaria',
              dryRun
                ? chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'encurtaria', dryRun])
                : chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'encurtaria', claim!.claimToken]),
              dryRun
            )
          } catch (error) {
            if (claim) {
              try {
                await libertarClaim(claim)
              } catch (releaseError) {
                registarErro(ac.email, releaseError)
              }
            }
            throw error
          }
        }
        if (claim) {
          const finalizado = await finalizarEvento(
            ac.userId,
            eventIdentity,
            ancora.data,
            ciclo.anos,
            saleIdentity,
            'finalizacao-pendente',
            null,
            { claimToken: claim.claimToken! }
          )
          if (!finalizado) report.claimConflicts += 1
          else estadoByUserId.set(String(ac.userId), finalizado)
        }
        continue
      }
      if (!elegivel) {
        report.skippedNoNewEvent += 1
        continue
      }
      if (!estado && !manual && !expiracaoVazia) {
        if (!dryRun) {
          const claim = await reclamarEvento(
            ac.userId,
            ciclo,
            eventIdentity,
            saleIdentity,
            expiration,
            'bootstrap'
          )
          if (!claim) {
            report.claimConflicts += 1
            continue
          }
          const finalizado = await finalizarEvento(
            ac.userId,
            eventIdentity,
            ancora.data,
            ciclo.anos,
            saleIdentity,
            'finalizacao-pendente',
            null,
            { claimToken: claim.claimToken! }
          )
          if (!finalizado) report.claimConflicts += 1
          else {
            estadoByUserId.set(String(ac.userId), finalizado)
            report.bootstrapped += 1
          }
        }
        continue
      }
      report.candidatesChecked += 1
      report.needsWrite += 1
      if (dryRun) {
        await criarRasto(
          ac.email,
          ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
          formatDateYYYYMMDD(expiration),
          'escrito',
          undefined,
          chaveIdempotente([
            'expiracao', String(ac.userId), eventIdentity, 'proposta', dryRun,
            emptyExpirationSnapshotAt?.toISOString() ?? null
          ]),
          true
        )
        report.wouldWrite += 1
        continue
      }
      const claim = await reclamarEvento(
        ac.userId,
        ciclo,
        eventIdentity,
        saleIdentity,
        expiration,
        'external-write',
        emptyExpirationSnapshotAt
      )
      if (!claim) {
        report.claimConflicts += 1
        continue
      }
      let rasto: { _id?: unknown } | null | undefined
      try {
        rasto = await criarRasto(
          ac.email,
          ac.expirationDate ? formatDateYYYYMMDD(ac.expirationDate) : null,
          formatDateYYYYMMDD(expiration),
          'escrito',
          undefined,
          chaveIdempotente(['expiracao', String(ac.userId), eventIdentity, 'tentativa', claim.claimToken])
        )
        if (!rasto) throw new Error('Rasto de expiração indisponível')
      } catch (error) {
        registarErro(ac.email, error)
        try {
          await libertarClaim(claim)
        } catch (releaseError) {
          registarErro(ac.email, releaseError)
        }
        continue
      }
      let ok = false
      try {
        mainParityProviderStarted()
        ok = await activeCampaignService.updateContactField(
          ac.email,
          AC_EXPIRATION_DATE_FIELD_ID,
          formatDateYYYYMMDD(expiration)
        )
        if (ok) mainParityProviderSucceeded()
      } catch (error) {
        await marcarRastoRecusado(rasto._id)
        registarErro(ac.email, error)
        try {
          await libertarClaim(claim)
        } catch (releaseError) {
          registarErro(ac.email, releaseError)
        }
        continue
      }
      if (!ok) {
        await marcarRastoRecusado(rasto._id)
        report.errors.push({ email: ac.email, error: 'updateContactField devolveu false' })
        try {
          await libertarClaim(claim)
        } catch (releaseError) {
          registarErro(ac.email, releaseError)
        }
        continue
      }
      report.written += 1
      const confirmado = await marcarConfirmacaoPendente(claim)
      if (!confirmado) {
        report.claimConflicts += 1
        continue
      }
      const finalizado = await finalizarEvento(
        ac.userId,
        eventIdentity,
        ancora.data,
        ciclo.anos,
        saleIdentity,
        'confirmacao-pendente',
        confirmado.pendingEmptyExpirationSnapshotAt
          ? new Date(confirmado.pendingEmptyExpirationSnapshotAt)
          : null,
        { claimToken: confirmado.claimToken! }
      )
      if (!finalizado) report.claimConflicts += 1
      else estadoByUserId.set(String(ac.userId), finalizado)
    } catch (error) {
      registarErro(ac.email, error)
    }
  }
  return report
}
export default syncAcExpirationDates
