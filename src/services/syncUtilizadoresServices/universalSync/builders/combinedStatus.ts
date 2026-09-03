/**
 * `$set` em caminhos irmãos não aplica defaults do schema a `combined.status`.
 * Toda actualização que reconstrói `combined.*` passa por esta guarda para que
 * um utilizador novo ou legado nunca fique sem estado.
 */
export interface CombinedStatusSource {
  combined?: { status?: string | null }
  status?: string | null
  hotmart?: { status?: string | null }
}

export function garantirCombinedStatus(
  user: CombinedStatusSource,
  updateFields: Record<string, unknown>,
): void {
  if (updateFields['combined.status'] != null) return
  updateFields['combined.status'] =
    user.combined?.status ?? user.status ?? user.hotmart?.status ?? 'ACTIVE'
}
