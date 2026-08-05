/**
 * Ports for the two pass-through user lookups.
 *
 * These endpoints carry no domain logic: one delegates to the existing
 * `getUserWithProducts` use case, the other is a single projected query. A
 * service layer between the controller and these ports would be an empty
 * indirection, so the controllers depend on the ports directly.
 */

export interface EnrichedUserReader {
  findEnriched(id: string): Promise<unknown | null>
}

export interface UserProductsReader {
  listByUser(userId: string): Promise<unknown[]>
}
