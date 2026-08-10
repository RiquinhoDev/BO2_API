import { createClassOpportunitiesController } from '../../controllers/analytics/classOpportunities.controller'
import { analyticsService } from './analyticsService'
import { ClassOpportunitiesService } from './classOpportunities.service'

const service = new ClassOpportunitiesService(analyticsService)

export const getClassOpportunities =
  createClassOpportunitiesController(service)
