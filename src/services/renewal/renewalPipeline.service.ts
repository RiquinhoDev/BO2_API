// ════════════════════════════════════════════════════════════
// 📁 src/services/renewal/renewalPipeline.service.ts
// Orquestrador sequencial de renovações: Sync Hotmart (vendas) →
// Sync AC (leitura) → Discord Roles. Cada passo só arranca depois
// do anterior terminar — evita a fragilidade de horas fixas onde
// um passo demorado ("corre mais") parte a cadência dos seguintes.
// Um erro num passo não trava os seguintes (Promise.allSettled não
// é usado propositadamente — a ordem tem de ser respeitada — mas
// cada passo tem try/catch próprio para o pipeline continuar).
//
// NASCE DESLIGADO (ver ensureRenewalPipelineJob em scheduler.ts) —
// ligar é acção manual na UI, só depois de validar localmente.
// ════════════════════════════════════════════════════════════

import { syncActiveStudentSalesHistory, SalesHistorySyncReport } from './hotmartSalesHistory.service'
import { syncActiveStudentAcRenewalData, AcRenewalDataSyncReport } from './acRenewalDataSync.service'
import { runDiscordRolesSyncJob, DiscordCronReport } from './discordRolesSync.service'

export interface RenewalPipelineStepResult<T> {
  success: boolean
  durationMs: number
  report?: T
  error?: string
}

export interface RenewalPipelineReport {
  hotmartSales: RenewalPipelineStepResult<SalesHistorySyncReport>
  acRenewalData: RenewalPipelineStepResult<AcRenewalDataSyncReport>
  discordRoles: RenewalPipelineStepResult<DiscordCronReport>
  success: boolean
}

async function runStep<T>(label: string, fn: () => Promise<T>): Promise<RenewalPipelineStepResult<T>> {
  const start = Date.now()
  try {
    console.log(`[RenewalPipeline] ▶ ${label}`)
    const report = await fn()
    const durationMs = Date.now() - start
    console.log(`[RenewalPipeline] ✅ ${label} (${Math.round(durationMs / 1000)}s)`)
    return { success: true, durationMs, report }
  } catch (error: any) {
    const durationMs = Date.now() - start
    console.error(`[RenewalPipeline] ❌ ${label} falhou:`, error?.message || error)
    return { success: false, durationMs, error: error?.message || 'Erro desconhecido' }
  }
}

/**
 * Corre os 3 passos em sequência, cada um só depois do anterior terminar.
 * Um passo que falhe não impede os seguintes de correr (o próximo passo
 * simplesmente trabalha com os dados que já existem em BD).
 */
export async function runRenewalPipeline(): Promise<RenewalPipelineReport> {
  const hotmartSales = await runStep('Sync Hotmart (vendas)', () => syncActiveStudentSalesHistory())
  const acRenewalData = await runStep('Sync AC (leitura)', () => syncActiveStudentAcRenewalData())
  const discordRoles = await runStep('Discord Roles', () => runDiscordRolesSyncJob())

  return {
    hotmartSales,
    acRenewalData,
    discordRoles,
    success: hotmartSales.success && acRenewalData.success && discordRoles.success
  }
}

export default runRenewalPipeline
