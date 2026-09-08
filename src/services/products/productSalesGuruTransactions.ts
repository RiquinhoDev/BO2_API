import axios from 'axios'
import { getOptionalGuruUserToken } from '../requestDrivenRuntimeConfig'
import { IntegrationUnavailableError } from '../../errors/integrationUnavailableError'
import { assertMainParityOwnership, mainParityProviderStarted, mainParityProviderSucceeded } from '../renewal/mainParityExecution'

export interface GuruTransaction {
  status: string
  dates?: { confirmed_at?: number | null }
  invoice?: { value?: number; status?: string; cycle?: number }
  payment?: { net?: number; gross?: number; total?: number; currency?: string }
}

interface TransactionPage {
  data?: GuruTransaction[]
  on_last_page?: number | boolean
  has_more_pages?: number | boolean
  next_cursor?: string
}

const guruApi = axios.create({ baseURL: 'https://digitalmanager.guru/api/v2', timeout: 20_000 })
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

async function requestPage(id: string, cursor?: string): Promise<TransactionPage> {
  const token = getOptionalGuruUserToken()
  if (!token) throw new IntegrationUnavailableError('guru')
  for (let attempt = 0; ; attempt++) {
    assertMainParityOwnership()
    mainParityProviderStarted()
    try {
      const response = await guruApi.get<TransactionPage>(`/subscriptions/${encodeURIComponent(id)}/transactions`, {
        headers: { Authorization: `Bearer ${token}` }, params: { per_page: 50, ...(cursor ? { cursor } : {}) },
      })
      mainParityProviderSucceeded()
      return response.data
    } catch (error: unknown) {
      if (!axios.isAxiosError(error) || error.response?.status !== 429 || attempt >= 5) throw error
      const seconds = Number(error.response.headers?.['retry-after'])
      const delay = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 30_000) : 500 * 2 ** attempt
      await sleep(delay)
    }
  }
}

export async function fetchSubscriptionTransactions(id: string): Promise<GuruTransaction[]> {
  const transactions: GuruTransaction[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const result = await requestPage(id, cursor)
    if (!result || !Array.isArray(result.data) || result.data.length > 50) throw new Error('Guru transactions incomplete: invalid page')
    transactions.push(...result.data)
    const last = result.on_last_page === 1 || result.on_last_page === true
    const more = result.has_more_pages === 1 || result.has_more_pages === true
    if (last && more) throw new Error('Guru transactions incomplete: contradictory page')
    if (last || result.has_more_pages === 0 || result.has_more_pages === false) return transactions
    if (!more || !result.data.length || typeof result.next_cursor !== 'string' || !result.next_cursor || cursors.has(result.next_cursor)) {
      throw new Error('Guru transactions incomplete: pagination cursor')
    }
    cursors.add(result.next_cursor)
    cursor = result.next_cursor
  }
  throw new Error('Guru transactions incomplete: page limit')
}
