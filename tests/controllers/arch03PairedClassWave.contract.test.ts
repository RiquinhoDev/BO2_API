import fs from 'node:fs'
import path from 'node:path'

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')

describe('ARCH03 paired class and operational wave', () => {
  const expectations: Array<[string, string, string]> = [
    ['src/controllers/classes/classInactivation.controller.ts', 'createCreateInactivationListController', 'createGetInactivationListsController'],
    ['src/controllers/classes/classInactivation.controller.ts', 'createGetInactivationListsController', 'createRevertInactivationController'],
    ['src/controllers/classes/classInactivation.controller.ts', 'createRevertInactivationController', 'createUpdateClassStatusController'],
    ['src/controllers/classes/classInactivation.controller.ts', 'createUpdateClassStatusController', ''],
    ['src/controllers/classes/classMutations.controller.ts', 'createAddOrEditClassController', 'createDeleteClassController'],
    ['src/controllers/classes/classMutations.controller.ts', 'createDeleteClassController', ''],
    ['src/controllers/businessAnalytics.controller.ts', 'async getBusinessOverview', 'async getProductComparison'],
    ['src/controllers/businessAnalytics.controller.ts', 'async getProductComparison', 'async invalidateCache'],
    ['src/controllers/classes/classRoster.controller.ts', 'createGetStudentsByClassController', 'createSearchStudentsController'],
    ['src/controllers/classes/classDirectory.controller.ts', 'createListClassesController', ''],
    ['src/controllers/classes/classDetails.controller.ts', 'createGetClassStatsController', 'createGetClassDetailsController'],
    ['src/controllers/studentsController.ts', 'getStudentComplete', ''],
    ['src/controllers/sync/history.controller.ts', 'getSyncHistory', 'getSyncStats'],
    ['src/controllers/syncUtilizadoresControllers/syncReports.controller.ts', 'getAllReports', 'getReportById'],
    ['src/controllers/renewal.controller.ts', 'listOffers', 'const CHECKOUT_BASE_URL'],
    ['src/controllers/renewal.controller.ts', 'listTurmas', 'performance'],
    ['src/controllers/courseLessons.controller.ts', 'listCourseLessons', 'updateCourseLessonUrl'],
  ]

  test.each(expectations)('%s %s uses only the canonical success helper', (file, start, end) => {
    const source = read(file)
    const from = source.indexOf(start)
    const to = end ? source.indexOf(end, from + start.length) : source.length
    expect(from).toBeGreaterThanOrEqual(0)
    expect(to).toBeGreaterThan(from)
    const owned = source.slice(from, to)
    expect(owned).toContain('successResponse(')
  })
})


