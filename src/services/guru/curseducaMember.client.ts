import axios from 'axios'
import { getOptionalCurseducaRuntimeSettings } from '../requestDrivenRuntimeConfig'

export interface CurseducaMemberSnapshot {
  status: number
  situation?: string
  name?: string
  raw: unknown
}

export interface CurseducaMemberFailure {
  error: string | number
  data?: unknown
}

export type CurseducaMemberResult =
  | { ok: true; value: CurseducaMemberSnapshot }
  | { ok: false; failure: CurseducaMemberFailure }

export interface CurseducaMemberClient {
  getMember(memberId: string | number): Promise<CurseducaMemberResult | undefined>
}

const failureFrom = (error: unknown): CurseducaMemberFailure => {
  if (!axios.isAxiosError(error)) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
  return {
    error: error.response?.status ?? error.message,
    data: error.response?.data,
  }
}

export const axiosCurseducaMemberClient: CurseducaMemberClient = {
  async getMember(memberId) {
    const settings = getOptionalCurseducaRuntimeSettings()
    if (!settings) return undefined
    try {
      const response = await axios.get(`${settings.apiUrl}/members/${memberId}`, {
        headers: {
          'Authorization': `Bearer ${settings.accessToken}`,
          'api_key': settings.apiKey,
        },
        timeout: 10000,
      })
      const payload: unknown = response.data
      const data = typeof payload === 'object' && payload !== null && 'data' in payload
        ? payload.data
        : payload
      const source = typeof data === 'object' && data !== null ? data : {}
      return {
        ok: true,
        value: {
          status: response.status,
          situation: 'situation' in source ? String(source.situation) : undefined,
          name: 'name' in source ? String(source.name) : undefined,
          raw: data,
        },
      }
    } catch (error: unknown) {
      return { ok: false, failure: failureFrom(error) }
    }
  },
}