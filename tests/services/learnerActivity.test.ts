import { getLastLearnerActivityDate } from '../../src/services/activity/learnerActivity'

test('returns the most recent learner signal and ignores system actions', () => {
  const activity = getLastLearnerActivityDate({
    communicationByCourse: {
      OGI_V1: {
        courseSpecificData: {
          lastReportOpenedAt: new Date('2026-07-18T00:00:00.000Z'),
          lastModuleCompletedAt: new Date('2026-07-16T00:00:00.000Z'),
        },
      },
    },
    hotmart: { lastAccessDate: new Date('2026-07-15T00:00:00.000Z') },
    curseduca: {
      lastLogin: new Date('2026-07-17T00:00:00.000Z'),
      lastAccess: new Date('2026-07-14T00:00:00.000Z'),
    },
  }, 'OGI_V1')

  expect(activity).toEqual(new Date('2026-07-18T00:00:00.000Z'))
})

test('returns null when the learner has no activity signal', () => {
  expect(getLastLearnerActivityDate({})).toBeNull()
})
