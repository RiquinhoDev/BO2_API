import tagOrchestrator, { tagOrchestratorV2 } from '../../src/services/activeCampaign/tagOrchestrator.service'
import { TagOrchestratorCore } from '../../src/services/activeCampaign/tagOrchestrator/core'

describe('tag orchestrator topology', () => {
  it('preserves the singleton while moving per-enrollment orchestration to the core', () => {
    expect(tagOrchestrator).toBe(tagOrchestratorV2)
    expect(tagOrchestrator).toBeInstanceOf(TagOrchestratorCore)
    expect(typeof tagOrchestrator.orchestrateUserProduct).toBe('function')
    expect(typeof tagOrchestrator.orchestrateAllUsersOfProduct).toBe('function')
  })
})
