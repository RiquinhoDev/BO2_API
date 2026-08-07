import { resolveHotmartConfig } from '../../../src/services/classes/hotmartClassSync.runtime'

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

describe('resolveHotmartConfig', () => {
  it('resolves the canonical config when subdomain and credentials are present', () => {
    expect(
      resolveHotmartConfig(env({ HOTMART_SUBDOMAIN: 'sub', HOTMART_CLIENT_ID: 'cid', HOTMART_CLIENT_SECRET: 'sec' })),
    ).toEqual({ subdomain: 'sub', clientId: 'cid', clientSecret: 'sec' })
  })

  it('is fail-closed (null) when HOTMART_SUBDOMAIN is missing', () => {
    expect(resolveHotmartConfig(env({ HOTMART_CLIENT_ID: 'cid', HOTMART_CLIENT_SECRET: 'sec' }))).toBeNull()
  })

  it('ignores the legacy lowercase subdomain and stays fail-closed', () => {
    expect(
      resolveHotmartConfig(env({ subdomain: 'ograndeinvestimento-bomrmk', HOTMART_CLIENT_ID: 'cid', HOTMART_CLIENT_SECRET: 'sec' })),
    ).toBeNull()
  })

  it('is fail-closed when credentials are missing', () => {
    expect(resolveHotmartConfig(env({ HOTMART_SUBDOMAIN: 'sub' }))).toBeNull()
  })
})
