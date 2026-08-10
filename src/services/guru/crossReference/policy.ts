import { getEffectiveStatus, type GuruDateInfo } from '../guru.constants'
import { isCurseducaEnrollmentActive } from '../../syncUtilizadoresServices/curseducaServices/curseducaMemberships'

export interface CrossReferenceAction {
  action: 'mark_para_inativar' | 'revert_to_active' | 'confirm_inactive' | 'skip'
  reason: string
}

export function determineCrossReferenceAction(
  guruStatus: string | null | undefined,
  curseducaMemberStatus: string | null | undefined,
  curseducaSituation: string | null | undefined,
  userProductStatus: string | null | undefined,
  guruDates?: GuruDateInfo | null
): CrossReferenceAction {
  if (!guruStatus) {
    return { action: 'skip', reason: 'Sem dados Guru' }
  }

  const strictCanceled = ['canceled', 'expired', 'refunded']
  const guruIsCanceled = strictCanceled.includes(guruStatus.toLowerCase())
  const guruIsActive = getEffectiveStatus(guruStatus, guruDates).isActive
  const curseducaIsActive = curseducaSituation === 'ACTIVE' || curseducaMemberStatus === 'ACTIVE'
  const curseducaIsInactive =
    curseducaMemberStatus === 'INACTIVE' || !isCurseducaEnrollmentActive(curseducaSituation)

  if (userProductStatus === 'INACTIVE') {
    if (guruIsCanceled && curseducaIsActive) {
      return {
        action: 'mark_para_inativar',
        reason: `Discrepância: Guru ${guruStatus}, CursEduca ACTIVE (re-detetado de INACTIVE)`
      }
    }
    return { action: 'skip', reason: 'Já INACTIVE' }
  }

  if (guruIsActive && userProductStatus === 'PARA_INATIVAR') {
    return {
      action: 'revert_to_active',
      reason: `Guru ${guruStatus} - não justifica inativação`
    }
  }

  if (guruIsCanceled && curseducaIsInactive && userProductStatus === 'PARA_INATIVAR') {
    return {
      action: 'confirm_inactive',
      reason: `Guru ${guruStatus} + CursEduca INACTIVE (confirmado)`
    }
  }

  if (guruIsCanceled && curseducaIsInactive && userProductStatus === 'ACTIVE') {
    return {
      action: 'confirm_inactive',
      reason: `Guru ${guruStatus} + CursEduca INACTIVE (API confirma)`
    }
  }

  if (guruIsCanceled && userProductStatus === 'ACTIVE') {
    return {
      action: 'mark_para_inativar',
      reason: `Discrepância: Guru ${guruStatus}, CursEduca ACTIVE`
    }
  }

  if (guruIsCanceled && userProductStatus === 'PARA_INATIVAR') {
    return { action: 'skip', reason: 'Já marcado PARA_INATIVAR' }
  }

  return { action: 'skip', reason: 'Consistente' }
}
