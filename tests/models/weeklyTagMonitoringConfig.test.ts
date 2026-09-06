import WeeklyTagMonitoringConfig from '../../src/models/tagMonitoring/WeeklyTagMonitoringConfig'

describe('WeeklyTagMonitoringConfig read boundary', () => {
  afterEach(() => jest.restoreAllMocks())

  it('returns an in-memory default without creating a document', async () => {
    jest.spyOn(WeeklyTagMonitoringConfig, 'findOne').mockResolvedValue(null)
    const create = jest.spyOn(WeeklyTagMonitoringConfig, 'create')

    const config = await WeeklyTagMonitoringConfig.getConfig()

    expect(config).toMatchObject({ scope: 'STUDENTS_ONLY', enabled: true })
    expect(config.isNew).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })
})
