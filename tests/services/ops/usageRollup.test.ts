import {
  averagePoints,
  isoWeekKey,
  peakPoints,
  startOfIsoWeek,
} from '../../../src/services/ops/usageRollup.service'
import type { IUsageRollupPoint } from '../../../src/models/UsageRollup'

function point(overrides: Partial<IUsageRollupPoint>): IUsageRollupPoint {
  return {
    httpRequests: 0,
    httpErrors: 0,
    httpServerErrors: 0,
    httpLatencyP95Ms: null,
    egressBytes: 0,
    providerCalls: 0,
    fmpCalls: 0,
    fmpRateLimited: 0,
    fmpDeduplicated: 0,
    mongoCommands: 0,
    mongoTotalBytes: null,
    redisUsedBytesPeak: null,
    redisEvictedKeys: null,
    redisHitRate: null,
    cacheHits: 0,
    cacheMisses: 0,
    jobRuns: 0,
    jobFailures: 0,
    rssBytesPeak: null,
    eventLoopP99MsPeak: null,
    students: null,
    activeStudents: null,
    processRestarts: 0,
    ...overrides,
  }
}

describe('resumos de consumo', () => {
  it('faz a media dos caudais mas fica com o ultimo valor dos niveis', () => {
    const week = averagePoints([
      point({ fmpCalls: 100, mongoTotalBytes: 1_000, students: 10 }),
      point({ fmpCalls: 200, mongoTotalBytes: 2_000, students: 12 }),
      point({ fmpCalls: 300, mongoTotalBytes: 3_000, students: 14 }),
    ])

    // Chamadas sao caudal: a media por dia e o que interessa.
    expect(week.fmpCalls).toBe(200)
    // Espaco ocupado e nivel: a media de 1k, 2k e 3k nao descreve nada. O que
    // conta contra o tecto e onde a semana ficou.
    expect(week.mongoTotalBytes).toBe(3_000)
    expect(week.students).toBe(14)
  })

  it('guarda o pico, que e o que a media esconde', () => {
    const week = peakPoints([
      point({ fmpCalls: 10, rssBytesPeak: 100 }),
      point({ fmpCalls: 900, rssBytesPeak: 5_000 }),
      point({ fmpCalls: 20, rssBytesPeak: 120 }),
    ])

    expect(week.fmpCalls).toBe(900)
    expect(week.rssBytesPeak).toBe(5_000)
  })

  it('ignora os dias sem medicao em vez de os contar como zero', () => {
    const week = averagePoints([
      point({ httpLatencyP95Ms: 100 }),
      point({ httpLatencyP95Ms: null }),
      point({ httpLatencyP95Ms: 300 }),
    ])

    expect(week.httpLatencyP95Ms).toBe(200)
  })

  it('numera as semanas pela norma ISO, incluindo a virada do ano', () => {
    // 1 de Janeiro de 2027 e uma sexta-feira: pertence a semana 53 de 2026.
    expect(isoWeekKey(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53')
    expect(isoWeekKey(new Date('2026-09-11T12:00:00Z'))).toBe('2026-W37')
  })

  it('faz a semana comecar a segunda-feira', () => {
    // 2026-09-11 e uma sexta-feira; a segunda dessa semana e dia 7.
    expect(startOfIsoWeek(new Date('2026-09-11T23:00:00Z')).toISOString())
      .toBe('2026-09-07T00:00:00.000Z')
  })
})
