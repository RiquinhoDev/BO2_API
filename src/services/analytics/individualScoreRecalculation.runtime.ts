import { createIndividualScoreRecalculationController } from '../../controllers/analytics/individualScoreRecalculation.controller'
import { calculateCombinedEngagement } from '../../utils/engagementCalculator'
import logger from '../../utils/logger'
import {
  IndividualScoreRecalculationService,
  type ScoreRecalculationObserver,
} from './individualScoreRecalculation.service'
import { MongooseIndividualScoreRecalculationRepository } from './mongooseIndividualScoreRecalculation.repository'

const observer: ScoreRecalculationObserver = {
  calculationFailed: ({ learnerId, cause }) => {
    logger.error('Individual score calculation failed', {
      learnerId,
      error: cause,
    })
  },
  writeFailed: ({ learnerIds, cause }) => {
    logger.error('Individual score batch write failed', {
      learnerIds,
      failedCount: learnerIds.length,
      error: cause,
    })
  },
}

const repository = new MongooseIndividualScoreRecalculationRepository(observer)
const service = new IndividualScoreRecalculationService(
  repository,
  calculateCombinedEngagement,
  () => new Date(),
  observer,
)

export const recalculateIndividualScores =
  createIndividualScoreRecalculationController(service)
