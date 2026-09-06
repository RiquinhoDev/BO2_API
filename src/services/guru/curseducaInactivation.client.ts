import axios from 'axios'
import { getOptionalCurseducaRuntimeSettings } from '../requestDrivenRuntimeConfig'

export type CurseducaInactivationResult =
  | { success: true; response: unknown; providerAttempted?: true }
  | { success: false; error: string; providerAttempted?: boolean }

export const CURSEDUCA_INACTIVATION_PROVIDER_TIMEOUT_MS = 10_000

export interface CurseducaInactivationClient {
  inactivate(memberId: string | number): Promise<CurseducaInactivationResult>
}

function errorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : String(error)
  }
  const data: unknown = error.response?.data
  if (typeof data === 'object' && data !== null) {
    if ('message' in data) return String(data.message)
    if ('error' in data) return String(data.error)
  }
  return error.message
}

export const axiosCurseducaInactivationClient: CurseducaInactivationClient = {
  async inactivate(memberId) {
    const settings = getOptionalCurseducaRuntimeSettings()
    if (!settings) {
      return {
        success: false,
        error: 'Credenciais CursEduca não configuradas (API_KEY ou ACCESS_TOKEN)',
        providerAttempted: false,
      }
    }
    try {
      const response = await axios.patch(
        `${settings.apiUrl}/inactivate-member`,
        { member: { id: Number(memberId) } },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${settings.accessToken}`,
            'api_key': settings.apiKey,
          },
          timeout: CURSEDUCA_INACTIVATION_PROVIDER_TIMEOUT_MS,
        },
      )
      return { success: true, response: response.data, providerAttempted: true }
    } catch (error: unknown) {
      return { success: false, error: errorMessage(error), providerAttempted: true }
    }
  },
}
