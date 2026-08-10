import renewalAcSync, {
  approveChanges,
  buildTurmaTagName,
  executePlan,
  expireStaleChanges,
  generatePlan,
  getRenewalAcStatus,
  revertChange,
  runRenewalAcSyncJob
} from '../../src/services/renewal/renewalAcSync.service'
import * as planning from '../../src/services/renewal/activeCampaign/planning'
import * as execution from '../../src/services/renewal/activeCampaign/execution'

describe('renewal ActiveCampaign service topology', () => {
  it('keeps planning and dry-run responsibilities in the planning module', () => {
    expect(planning.buildTurmaTagName).toBe(buildTurmaTagName)
    expect(planning.generatePlan).toBe(generatePlan)
    expect(planning.expireStaleChanges).toBe(expireStaleChanges)
  })

  it('keeps writes and orchestration in the execution module', () => {
    expect(execution.approveChanges).toBe(approveChanges)
    expect(execution.executePlan).toBe(executePlan)
    expect(execution.revertChange).toBe(revertChange)
    expect(execution.getRenewalAcStatus).toBe(getRenewalAcStatus)
    expect(execution.runRenewalAcSyncJob).toBe(runRenewalAcSyncJob)
  })

  it('preserves the legacy default facade', () => {
    expect(renewalAcSync.generatePlan).toBe(generatePlan)
    expect(renewalAcSync.executePlan).toBe(executePlan)
    expect(renewalAcSync.runRenewalAcSyncJob).toBe(runRenewalAcSyncJob)
  })
})
