import pipeline, {
  executeDailyPipeline,
  executeTagRulesOnly,
} from '../../../src/services/cron/dailyPipeline.service'
import { executeDailyPipeline as focusedDaily } from '../../../src/services/cron/dailyPipelineExecution.service'
import { executeTagRulesOnly as focusedTags } from '../../../src/services/cron/tagRulesOnlyPipeline.service'

test('daily pipeline facade delegates to focused orchestrators', () => {
  expect(executeDailyPipeline).toBe(focusedDaily)
  expect(executeTagRulesOnly).toBe(focusedTags)
  expect(pipeline.executeDailyPipeline).toBe(focusedDaily)
  expect(pipeline.executeTagRulesOnly).toBe(focusedTags)
})
