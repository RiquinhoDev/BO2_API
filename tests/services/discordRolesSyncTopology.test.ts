import discordRenewal, {
  executeDiscordRolesPlan,
  generateDiscordRolesPlan,
  runDiscordRolesSyncJob,
  sendDiscordMessage
} from '../../src/services/renewal/discordRolesSync.service'
import * as planning from '../../src/services/renewal/discord/planning'
import * as execution from '../../src/services/renewal/discord/execution'
import * as job from '../../src/services/renewal/discord/job'

describe('Discord renewal sync topology', () => {
  it('separates planning from gated Discord effects while preserving the facade', () => {
    expect(planning.generateDiscordRolesPlan).toBe(generateDiscordRolesPlan)
    expect(execution.executeDiscordRolesPlan).toBe(executeDiscordRolesPlan)
    expect(execution.sendDiscordMessage).toBe(sendDiscordMessage)
    expect(job.runDiscordRolesSyncJob).toBe(runDiscordRolesSyncJob)
    expect(discordRenewal.generateDiscordRolesPlan).toBe(generateDiscordRolesPlan)
    expect(discordRenewal.executeDiscordRolesPlan).toBe(executeDiscordRolesPlan)
    expect(discordRenewal.runDiscordRolesSyncJob).toBe(runDiscordRolesSyncJob)
  })
})
