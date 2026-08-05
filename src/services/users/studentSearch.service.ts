import {
  MAX_SEARCH_RESULTS,
  SEARCH_FETCH_LIMIT,
  type PopulatedUserProductRecord,
  type StudentSearchCriteria,
  type StudentSearchOutcome,
  type StudentSearchReader,
} from './studentSearch.contract'
import { transformUserForFrontend, type TransformedStudent } from './studentSearch.transform'

export class StudentSearchService {
  constructor(private readonly reader: StudentSearchReader) {}

  async search(
    criteria: StudentSearchCriteria,
  ): Promise<StudentSearchOutcome<TransformedStudent>> {
    // One row past the cap: its presence is the truncation signal, so no second
    // count query has to repeat the same regex scan.
    const found = await this.reader.findStudents(criteria, SEARCH_FETCH_LIMIT)
    const truncated = found.length > MAX_SEARCH_RESULTS
    const students = truncated ? found.slice(0, MAX_SEARCH_RESULTS) : found

    if (!students.length) return { students: [], truncated: false }

    // Only the students that will actually be returned are enriched.
    const products = await this.reader.findProducts(students.map(student => student._id))

    const productsByUser = new Map<string, PopulatedUserProductRecord[]>()
    for (const product of products) {
      const userId = product.userId.toString()
      const bucket = productsByUser.get(userId)
      if (bucket) bucket.push(product)
      else productsByUser.set(userId, [product])
    }

    return {
      students: students.map(student => transformUserForFrontend(student, productsByUser)),
      truncated,
    }
  }
}
