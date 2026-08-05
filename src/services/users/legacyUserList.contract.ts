/**
 * Ports for the legacy `/users/listUsers` listing.
 *
 * The live consumer is outside this repository — the legacy Backoffice reads
 * `data.users` and `data.count` — so nothing here may change shape, defaults
 * or paging without that client being migrated first.
 */

export interface LegacyUserListCriteria {
  search?: string
  status?: string
  hasDiscord?: string
  hasHotmart?: string
}

export interface LegacyUserListPagination {
  skip: number
  limit: number
}

export interface LegacyUserListPage {
  rows: unknown[]
  total: number
}

export interface LegacyUserListReader {
  /**
   * Runs the rows query and the count in parallel, as the legacy handler did.
   * Kept as one call so that concurrency stays a property of the adapter.
   */
  listAndCount(
    criteria: LegacyUserListCriteria,
    pagination: LegacyUserListPagination,
  ): Promise<LegacyUserListPage>
}

export interface LegacyUserListResult {
  users: unknown[]
  count: number
  page: number
  limit: number
  totalPages: number
}
