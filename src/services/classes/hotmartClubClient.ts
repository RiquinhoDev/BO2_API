import axios from 'axios'

export interface HotmartClubUser {
  email?: string
  class_id?: string
  user_id?: string
  status?: 'ACTIVE' | 'INACTIVE'
  purchase_date?: number
}

export interface HotmartClubPage {
  users: HotmartClubUser[]
  nextPageToken: string | null
}

/**
 * Port for the Hotmart Club API. Credentials/subdomain are injected via the
 * config (never read from process.env here). When unconfigured the client is
 * fail-closed: isConfigured() is false and the network methods throw
 * HotmartNotConfiguredError so callers can answer with a stable 503.
 */
export interface HotmartClubClient {
  isConfigured(): boolean
  getAccessToken(): Promise<string>
  fetchUsersPage(accessToken: string, pageToken: string | null): Promise<HotmartClubPage>
}

export interface HotmartClubConfig {
  subdomain: string
  clientId: string
  clientSecret: string
}

export class HotmartNotConfiguredError extends Error {
  constructor() {
    super('Hotmart sync não configurado')
    this.name = 'HotmartNotConfiguredError'
  }
}

interface HotmartTokenResponse {
  access_token?: string
}

interface HotmartPageInfo {
  next_page_token?: string
}

interface HotmartUsersResponse {
  users?: HotmartClubUser[]
  items?: HotmartClubUser[]
  data?: HotmartClubUser[]
  page_info?: HotmartPageInfo
  pageInfo?: HotmartPageInfo
}

export class AxiosHotmartClubClient implements HotmartClubClient {
  constructor(private readonly config: HotmartClubConfig | null) {}

  isConfigured(): boolean {
    return this.config !== null
  }

  private requireConfig(): HotmartClubConfig {
    if (!this.config) throw new HotmartNotConfiguredError()
    return this.config
  }

  async getAccessToken(): Promise<string> {
    const { clientId, clientSecret } = this.requireConfig()
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

    const response = await axios.post<HotmartTokenResponse>(
      'https://api-sec-vlc.hotmart.com/security/oauth/token',
      new URLSearchParams({ grant_type: 'client_credentials' }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
        },
      },
    )

    if (!response.data.access_token) throw new Error('Access token not found')
    return response.data.access_token
  }

  async fetchUsersPage(accessToken: string, pageToken: string | null): Promise<HotmartClubPage> {
    const { subdomain } = this.requireConfig()
    let url = `https://developers.hotmart.com/club/api/v1/users?subdomain=${subdomain}`
    if (pageToken) url += `&page_token=${encodeURIComponent(pageToken)}`

    const response = await axios.get<HotmartUsersResponse>(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    const users = response.data.users || response.data.items || response.data.data || []
    const pageInfo = response.data.page_info || response.data.pageInfo || {}
    return { users, nextPageToken: pageInfo.next_page_token || null }
  }
}
