import axios from 'axios'
import { signOldApiToken } from '../../security/jwt'
import logger from '../../utils/logger'

/**
 * Port for delegating Discord role removal to the legacy API. The vertical
 * depends on this interface; the runtime injects the axios-backed adapter and
 * tests inject a fake, so no test ever touches the network.
 */
export interface DiscordInactivationDelegator {
  delegate(classIds: string[], scope: string): Promise<number>
}

interface DiscordInactivationResponse {
  list?: { totalDiscordUpdates?: number }
  discordUpdates?: number
}

function axiosErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : String(error)
  const data = error.response?.data
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message
  }
  return error.message
}

// Machine-to-machine admin JWT for the legacy API's authenticateAdmin guard.
// The secret authority is OLD_API_JWT_SECRET (distinct from this API's secret).
function buildOldApiHeaders(scope: string) {
  const token = signOldApiToken({ role: 'admin', service: 'BO2_API', scope }, { expiresIn: '5m' })
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

export class AxiosDiscordInactivationDelegator implements DiscordInactivationDelegator {
  async delegate(classIds: string[], scope: string): Promise<number> {
    const oldApiUrl = process.env.OLD_API_URL || 'https://api.serriquinho.com'
    try {
      const response = await axios.post<DiscordInactivationResponse>(
        `${oldApiUrl}/classes/inactivationLists/create`,
        { classIds, platforms: ['discord'] },
        { timeout: 120000, headers: buildOldApiHeaders(scope) },
      )
      return response.data?.list?.totalDiscordUpdates || response.data?.discordUpdates || 0
    } catch (error) {
      // Best-effort delegation: log and continue so inactivation never fails on Discord.
      logger.warn('Discord: erro ao delegar para API antiga', { error: axiosErrorMessage(error) })
      return 0
    }
  }
}
