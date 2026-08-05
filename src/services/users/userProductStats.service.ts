/**
 * className-derived product membership counts behind GET /api/users/getProductStats.
 * The reduction is pure and lives here with the service; the reader owns the
 * projected find. Logic is preserved verbatim from the legacy handler.
 */

export interface ProductMemberRecord {
  className?: string
  hotmartUserId?: string
  curseducaUserId?: string
}

export interface ProductStats {
  total: number
  grandeInvestimento: number
  relatoriosClareza: number
  ambos: number
  semProdutos: number
  hotmart: number
  curseduca: number
}

export interface UserProductStatsReader {
  listMembers(): Promise<ProductMemberRecord[]>
}

/** Reduces the member projection into product membership counts. */
export function reduceProductStats(members: ProductMemberRecord[]): ProductStats {
  const stats: ProductStats = {
    total: members.length,
    grandeInvestimento: 0,
    relatoriosClareza: 0,
    ambos: 0,
    semProdutos: 0,
    hotmart: 0,
    curseduca: 0,
  }

  for (const member of members) {
    const hasGrande = member.className?.toLowerCase().includes('grande investimento')
      || member.className?.toLowerCase().includes('grande_investimento')
    const hasRelatorios = member.className?.toLowerCase().includes('relatórios clareza')
      || member.className?.toLowerCase().includes('relatorios clareza')

    if (hasGrande) stats.grandeInvestimento++
    if (hasRelatorios) stats.relatoriosClareza++
    if (hasGrande && hasRelatorios) stats.ambos++
    if (!hasGrande && !hasRelatorios) stats.semProdutos++

    if (member.hotmartUserId && member.hotmartUserId.trim()) stats.hotmart++
    if (member.curseducaUserId && member.curseducaUserId.trim()) stats.curseduca++
  }

  return stats
}

export class UserProductStatsService {
  constructor(private readonly reader: UserProductStatsReader) {}

  async get(): Promise<ProductStats> {
    const members = await this.reader.listMembers()
    return reduceProductStats(members)
  }
}
