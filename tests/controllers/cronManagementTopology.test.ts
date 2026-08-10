import * as facade from '../../src/controllers/syncUtilizadoresControllers/cronManagement.controller'
import * as queries from '../../src/controllers/syncUtilizadoresControllers/cronManagement/queries.controller'
import * as rules from '../../src/controllers/syncUtilizadoresControllers/cronManagement/tagRules.controller'
import * as commands from '../../src/controllers/syncUtilizadoresControllers/cronManagement/commands.controller'
import * as operations from '../../src/controllers/syncUtilizadoresControllers/cronManagement/operations.controller'

test('Cron management facade delegates every handler to a focused owner', () => {
  expect(facade.getAllJobs).toBe(queries.getAllJobs)
  expect(facade.getJobById).toBe(queries.getJobById)
  expect(facade.getAvailableTagRules).toBe(rules.getAvailableTagRules)
  expect(facade.createJob).toBe(commands.createJob)
  expect(facade.updateJob).toBe(commands.updateJob)
  expect(facade.deleteJob).toBe(commands.deleteJob)
  expect(facade.toggleJob).toBe(commands.toggleJob)
  expect(facade.triggerJob).toBe(commands.triggerJob)
  expect(facade.getJobHistory).toBe(operations.getJobHistory)
  expect(facade.validateCronExpression).toBe(operations.validateCronExpression)
  expect(facade.getSchedulerStatus).toBe(operations.getSchedulerStatus)
  expect(facade.triggerTagRulesOnly).toBe(operations.triggerTagRulesOnly)
})
