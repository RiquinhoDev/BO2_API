import type { StatsOverviewReader, StatsOverviewResult } from './statsOverview.contract'

export class StatsOverviewService {
  constructor(private readonly reader: StatsOverviewReader) {}

  async get(): Promise<StatsOverviewResult> {
    // Sequential by contract: the legacy handler awaited each read in turn and
    // that order (users -> platform -> product) is characterized, so it is not
    // collapsed into Promise.all here. Parallelizing is separate work.
    const totalUsers = await this.reader.countUsers()
    const byPlatform = await this.reader.countByPlatform()
    const byProduct = await this.reader.countByProduct()

    return { totalUsers, byPlatform, byProduct }
  }
}
