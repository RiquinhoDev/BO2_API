import mongoose from 'mongoose'
import { transformUserForFrontend } from '../../../src/services/users/studentSearch.transform'
import type { PopulatedUserProductRecord, UserTransformSource } from '../../../src/services/users/studentSearch.contract'

const id = new mongoose.Types.ObjectId()
const user = (fields: Record<string, unknown>): UserTransformSource => ({ _id: id, ...fields } as unknown as UserTransformSource)

test.each([
  ['lean object', { TESTIMONIALS: { currentTags: ['testimonial'] } }],
  ['hydrated Map', new Map([['TESTIMONIALS', { currentTags: ['testimonial'] }]])],
])('student search preserves testimonial tags from %s', (_name, communicationByCourse) => {
  expect(transformUserForFrontend(user({ communicationByCourse })).acTagsByProduct.TESTIMONIALS.tags)
    .toEqual(['testimonial'])
})

test('student search handles historical classes without names while adding products', () => {
  const products = [{ productId: { code: 'new', name: 'New product' }, platform: 'hotmart', status: 'ACTIVE' }] as PopulatedUserProductRecord[]
  const result = transformUserForFrontend(
    user({ combined: { allClasses: [{ classId: 'old' }] } }),
    new Map([[id.toString(), products]]),
  )
  expect(result.combined.allClasses.map(value => value.classId)).toEqual(['old', 'new'])
})
