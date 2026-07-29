import { createClassComparisonController } from '../../controllers/analytics/classComparison.controller'
import {
  ClassComparisonService,
  type ClassComparisonData,
} from './classComparison.service'
import { analyticsService } from './analyticsService'
import { InMemoryTtlCache } from './inMemoryTtlCache'

const cache = new InMemoryTtlCache<ClassComparisonData>(5 * 60 * 1_000)
const service = new ClassComparisonService(analyticsService, cache)

export const compareClasses = createClassComparisonController(service)
