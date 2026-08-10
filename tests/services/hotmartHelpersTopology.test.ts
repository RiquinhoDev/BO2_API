import helpers, { calculateProgress, fetchAllHotmartUsers, fetchCourseModules } from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart.helpers'
import * as transport from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/transport'
import * as processing from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/processing'
import * as modules from '../../src/services/syncUtilizadoresServices/hotmartServices/hotmart/modules'

describe('Hotmart helpers topology', () => {
  it('preserves named and default exports across focused modules', () => {
    expect(transport.fetchAllHotmartUsers).toBe(fetchAllHotmartUsers)
    expect(processing.calculateProgress).toBe(calculateProgress)
    expect(modules.fetchCourseModules).toBe(fetchCourseModules)
    expect(helpers.fetchAllHotmartUsers).toBe(fetchAllHotmartUsers)
    expect(helpers.calculateProgress).toBe(calculateProgress)
  })
})
