// ════════════════════════════════════════════════════════════
// 📁 src/jobs/dailyPipeline/tagEvaluation/index.ts
// Sistema de Avaliação de Tags - Entry Point
// ════════════════════════════════════════════════════════════

export { calculateEngagementScore } from './engagementScore'
export { evaluateInactivityTags } from './inactivityTags'
export { evaluateEngagementTags } from './engagementTags'
export { evaluateProgressTags } from './progressTags'
export { evaluateCompletionTags } from './completionTags'
export { evaluateAccountStatusTags } from './accountStatusTags'
export { evaluateStudentTags } from './evaluateStudentTags'

export * from './types'
