import discordRenewal, {
  executeDiscordRolesPlan,
  generateDiscordRolesPlan,
  sendDiscordMessage
} from '../../src/services/renewal/discordRolesSync.service'
import * as planning from '../../src/services/renewal/discord/planning'
import * as execution from '../../src/services/renewal/discord/execution'

describe('Discord renewal sync topology', () => {
  it('separates planning from gated Discord effects while preserving the facade', () => {
    expect(planning.generateDiscordRolesPlan).toBe(generateDiscordRolesPlan)
    expect(execution.executeDiscordRolesPlan).toBe(executeDiscordRolesPlan)
    expect(execution.sendDiscordMessage).toBe(sendDiscordMessage)
    expect(discordRenewal.generateDiscordRolesPlan).toBe(generateDiscordRolesPlan)
    expect(discordRenewal.executeDiscordRolesPlan).toBe(executeDiscordRolesPlan)
  })
})
