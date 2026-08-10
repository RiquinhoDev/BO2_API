/**
 * Ports for the legacy `/users/listUsers` listing.
 *
 * The live consumer is outside this repository — the legacy Backoffice reads
 * `data.users` and `data.count` — so nothing here may change shape, defaults
 * or paging without that client being migrated first.
 */

export interface UserListCriteria {
  search?: string
  status?: string
  hasDiscord?: string
  hasHotmart?: string
}

export interface UserListPagination {
  skip: number
  limit: number
}

export interface UserListPage {
  rows: unknown[]
  total: number
}

export interface UserListReader {
  /**
   * Runs the rows query and the count in parallel, as the legacy handler did.
   * Kept as one call so that concurrency stays a property of the adapter.
   */
  listAndCount(
    criteria: UserListCriteria,
    pagination: UserListPagination,
  ): Promise<UserListPage>
}

export interface UserListResult {
  users: unknown[]
  count: number
  page: number
  limit: number
  totalPages: number
}
