import type {
  PopulatedUserProductRecord,
  StudentSearchCriteria,
  StudentSearchReader,
} from './studentSearch.contract'
import { transformUserForFrontend, type TransformedStudent } from './studentSearch.transform'

export class StudentSearchService {
  constructor(private readonly reader: StudentSearchReader) {}

  async search(criteria: StudentSearchCriteria): Promise<TransformedStudent[]> {
    const students = await this.reader.findStudents(criteria)
    if (!students.length) return []

    // One products query for every match, then grouped in memory.
    const products = await this.reader.findProducts(students.map(student => student._id))

    const productsByUser = new Map<string, PopulatedUserProductRecord[]>()
    for (const product of products) {
      const userId = product.userId.toString()
      const bucket = productsByUser.get(userId)
      if (bucket) bucket.push(product)
      else productsByUser.set(userId, [product])
    }

    return students.map(student => transformUserForFrontend(student, productsByUser))
  }
}
