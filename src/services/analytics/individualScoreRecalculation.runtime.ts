import { createIndividualScoreRecalculationController } from '../../controllers/analytics/individualScoreRecalculation.controller'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'
import logger, { type AppLogger } from '../../utils/logger'
import {
  IndividualScoreRecalculationService,
  type ScoreRecalculationObserver,
} from './individualScoreRecalculation.service'
import { MongooseIndividualScoreRecalculationRepository } from './mongooseIndividualScoreRecalculation.repository'

export function createScoreRecalculationObserver(
  runtimeLogger: Pick<AppLogger, 'error'>,
): ScoreRecalculationObserver {
  return {
    calculationFailed: ({ learnerId, cause }) => {
      runtimeLogger.error('Individual score calculation failed', {
        learnerId,
        error: cause,
      })
    },
    writeFailed: ({ learnerIds, cause }) => {
      runtimeLogger.error('Individual score batch write failed', {
        failedCount: learnerIds.length,
        error: cause,
      })
    },
  }
}

const observer = createScoreRecalculationObserver(logger)
const repository = new MongooseIndividualScoreRecalculationRepository(observer)
const service = new IndividualScoreRecalculationService(
  repository,
  calculateCombinedEngagement,
  () => new Date(),
  observer,
)

export const recalculateIndividualScores =
  createIndividualScoreRecalculationController(service)
