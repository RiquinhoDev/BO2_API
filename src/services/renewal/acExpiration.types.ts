import type mongoose from 'mongoose'

export interface AcExpirationSyncReport {
  candidatesChecked: number
  alreadyInSync: number
  needsWrite: number
  written: number
  wouldWrite: number
  skippedRefunded: number
  skippedNoContact: number
  skippedNoHotmartData: number
  semTurma: number
  skippedWouldShorten: number
  bootstrapped: number
  skippedNoNewEvent: number
  claimConflicts: number
  confirmationPending: number
  divergentes: Array<{ email: string; acTem: Date | null; calculado: Date; motivo: 'encurtaria' | 'diferente' }>
  errors: Array<{ email: string; error: string }>
}

export interface EstadoEvento {
  userId: mongoose.Types.ObjectId
  status?: 'livre' | 'tratado' | 'claimado' | 'finalizacao-pendente' | 'confirmacao-pendente'
  eventIdentity: string | null
  saleIdentity?: string | null
  anchorDate: Date | null
  cycleYears: 1 | 2 | null
  emptyExpirationSnapshotAt?: Date | null
  claimToken?: string | null
  leaseUntil?: Date | null
  claimedAt?: Date | null
  pendingEventIdentity?: string | null
  pendingSaleIdentity?: string | null
  pendingAnchorDate?: Date | null
  pendingCycleYears?: 1 | 2 | null
  pendingExpiration?: Date | null
  pendingEmptyExpirationSnapshotAt?: Date | null
  pendingReason?: 'bootstrap' | 'already-right' | 'would-shorten' | 'external-write' | null
}

export interface SeletorManual {
  email?: string
  userId?: string
}
